-- GharDrop schema. Safe to run more than once.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('passenger', 'operator', 'admin')),
  affiliation_status text,
  created_at timestamptz not null default now()
);

create table if not exists operator_profiles (
  id uuid primary key references profiles(id),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  contact_details jsonb not null default '{}'::jsonb,
  demo_label text
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references operator_profiles(id),
  type text not null check (type in ('shared_car', 'tempo_traveller', 'mini_bus')),
  capacity integer not null check (capacity > 0),
  registration text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected'))
);

create table if not exists routes (
  id uuid primary key default gen_random_uuid(),
  origin text not null,
  destination text not null,
  corridor text not null,
  unique (origin, destination)
);

create table if not exists drop_rooms (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  departure_date date not null,
  departure_window text not null check (departure_window in ('morning', 'afternoon', 'evening', 'night')),
  status text not null default 'open' check (status in ('open', 'closed', 'expired')),
  created_by uuid references profiles(id),
  vibe text,
  target_occupancy integer,
  share_code text unique,
  selected_bid_id uuid,
  drill boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists drop_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references drop_rooms(id),
  passenger_id uuid not null references profiles(id),
  seats integer not null default 1 check (seats > 0),
  commitment_status text not null default 'interested' check (commitment_status in ('interested', 'committed', 'left')),
  unique (room_id, passenger_id)
);

alter table drop_members add column if not exists offered_fare numeric;

create table if not exists operator_bids (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references drop_rooms(id),
  operator_id uuid not null references profiles(id),
  vehicle_id uuid not null references vehicles(id),
  fixed_quote numeric not null check (fixed_quote >= 0),
  inclusions jsonb not null default '{}'::jsonb,
  pickup_point text,
  departure_time text,
  toll_included boolean not null default false,
  driver_allowance_included boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'selected', 'accepted', 'rejected', 'withdrawn')),
  transcript text,
  created_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references drop_rooms(id),
  bid_id uuid references operator_bids(id),
  passenger_id uuid not null references profiles(id),
  status text not null check (status in (
    'interested',
    'offer_received',
    'commitment_pending',
    'minimum_occupancy_reached',
    'operator_accepted',
    'confirmed',
    'departed',
    'completed',
    'cancelled',
    'expired',
    'refunded'
  )),
  idempotency_key text not null unique,
  seats integer not null default 1 check (seats > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists bookings_active_passenger_room
  on bookings (room_id, passenger_id)
  where status not in ('cancelled', 'expired', 'refunded');

create table if not exists journey_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  event_type text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists family_contacts (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references profiles(id),
  contact_name text not null,
  language text not null,
  token text not null unique,
  consented_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  family_contact_id uuid references family_contacts(id),
  booking_id uuid references bookings(id),
  message text not null,
  translated_message text,
  language text not null,
  audio_base64 text,
  delivery_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists booking_attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid,
  bid_id uuid,
  passenger_id uuid,
  idempotency_key text,
  outcome text not null,
  latency_ms integer,
  error_code text,
  remaining_seats integer,
  source text not null default 'user',
  created_at timestamptz not null default now()
);

create index if not exists booking_attempts_created_at_idx
  on booking_attempts (created_at desc);

create table if not exists product_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_name text not null,
  variant text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ops_controls (
  id integer primary key default 1 check (id = 1),
  booking_writes_paused boolean not null default false,
  pause_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists nudgebee_dispatches (
  id uuid primary key default gen_random_uuid(),
  payload jsonb not null,
  response_status integer,
  response_body text,
  connected boolean not null,
  created_at timestamptz not null default now()
);

insert into ops_controls (id, booking_writes_paused)
values (1, false)
on conflict (id) do nothing;

create or replace function commit_booking(
  p_room_id uuid,
  p_bid_id uuid,
  p_passenger_id uuid,
  p_idempotency_key text,
  p_seats integer,
  p_min_ratio numeric
) returns jsonb
language plpgsql
as $$
declare
  v_existing bookings%rowtype;
  v_booking bookings%rowtype;
  v_bid operator_bids%rowtype;
  v_paused boolean;
  v_capacity integer;
  v_held integer;
  v_status text;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  end if;

  select * into v_existing from bookings where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'booking_id', v_existing.id,
      'status', v_existing.status
    );
  end if;

  select booking_writes_paused into v_paused from ops_controls where id = 1 for update;
  if coalesce(v_paused, false) then
    return jsonb_build_object('ok', false, 'error', 'booking_writes_paused');
  end if;

  if not exists (
    select 1 from drop_members
    where room_id = p_room_id
      and passenger_id = p_passenger_id
      and commitment_status <> 'left'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  select * into v_bid
  from operator_bids
  where id = p_bid_id
    and room_id = p_room_id
    and status in ('submitted', 'selected', 'accepted')
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'bid_not_found');
  end if;

  select capacity into v_capacity from vehicles where id = v_bid.vehicle_id for update;
  if v_capacity is null then
    return jsonb_build_object('ok', false, 'error', 'vehicle_missing');
  end if;

  select coalesce(sum(seats), 0)::integer into v_held
  from bookings
  where bid_id = p_bid_id
    and status in (
      'commitment_pending',
      'minimum_occupancy_reached',
      'operator_accepted',
      'confirmed',
      'departed',
      'completed'
    );

  if p_seats is null or p_seats < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_seats');
  end if;

  if v_held + p_seats > v_capacity then
    return jsonb_build_object(
      'ok', false,
      'error', 'capacity_exceeded',
      'remaining', greatest(v_capacity - v_held, 0),
      'capacity', v_capacity
    );
  end if;

  select * into v_booking
  from bookings
  where room_id = p_room_id
    and passenger_id = p_passenger_id
    and status not in ('cancelled', 'expired', 'refunded')
  for update;

  if found and v_booking.status in (
    'commitment_pending',
    'minimum_occupancy_reached',
    'operator_accepted',
    'confirmed',
    'departed',
    'completed'
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_committed',
      'booking_id', v_booking.id,
      'status', v_booking.status
    );
  end if;

  if found then
    update bookings
    set bid_id = p_bid_id,
        status = 'commitment_pending',
        seats = p_seats,
        idempotency_key = p_idempotency_key
    where id = v_booking.id
    returning * into v_booking;
  else
    insert into bookings (room_id, bid_id, passenger_id, status, idempotency_key, seats)
    values (p_room_id, p_bid_id, p_passenger_id, 'commitment_pending', p_idempotency_key, p_seats)
    returning * into v_booking;
  end if;

  update drop_members
  set commitment_status = 'committed',
      seats = p_seats
  where room_id = p_room_id and passenger_id = p_passenger_id;

  select coalesce(sum(seats), 0)::integer into v_held
  from bookings
  where bid_id = p_bid_id
    and status in (
      'commitment_pending',
      'minimum_occupancy_reached',
      'operator_accepted',
      'confirmed',
      'departed',
      'completed'
    );

  if v_capacity > 0 and (v_held::numeric / v_capacity::numeric) >= coalesce(p_min_ratio, 0.75) then
    update bookings
    set status = case
      when status = 'operator_accepted' then 'confirmed'
      when status = 'commitment_pending' then 'minimum_occupancy_reached'
      else status
    end
    where bid_id = p_bid_id
      and status in ('operator_accepted', 'commitment_pending');
  end if;

  select status into v_status from bookings where id = v_booking.id;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'booking_id', v_booking.id,
    'status', v_status,
    'confirmed_seats', v_held,
    'capacity', v_capacity,
    'remaining', greatest(v_capacity - v_held, 0)
  );
exception
  when unique_violation then
    select * into v_existing from bookings where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'booking_id', v_existing.id,
        'status', v_existing.status
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'conflict');
end;
$$;

create or replace function accept_bid(
  p_bid_id uuid,
  p_operator_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_bid operator_bids%rowtype;
  v_updated integer;
begin
  select * into v_bid from operator_bids where id = p_bid_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'bid_not_found');
  end if;
  if v_bid.operator_id <> p_operator_id then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_bid.status in ('rejected', 'withdrawn') then
    return jsonb_build_object('ok', false, 'error', 'bid_closed');
  end if;

  update operator_bids set status = 'accepted' where id = p_bid_id;
  update drop_rooms set selected_bid_id = p_bid_id where id = v_bid.room_id;

  update bookings
  set status = case
    when status = 'minimum_occupancy_reached' then 'confirmed'
    when status = 'commitment_pending' then 'operator_accepted'
    else status
  end
  where bid_id = p_bid_id
    and status in ('minimum_occupancy_reached', 'commitment_pending');

  get diagnostics v_updated = row_count;

  return jsonb_build_object('ok', true, 'updated', v_updated, 'room_id', v_bid.room_id);
end;
$$;
