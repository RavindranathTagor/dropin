import { randomBytes, randomUUID } from "crypto";
import { HOLDING_SQL, VEHICLE_LABELS } from "@/lib/constants";
import { jsonValue, query, transaction, type DbClient } from "@/lib/db";
import { asDate, asNumber } from "@/lib/format";
import { farePerPassenger, fullVehicleProjection } from "@/lib/pricing";
import { remainingSeats } from "@/lib/capacity";
import { getFlags } from "@/lib/flags";
import { accessRoom, canCreateRoom, loadActor, normalizeScope } from "@/lib/crewmark";

type RoomRow = {
  id: string;
  origin: string;
  destination: string;
  corridor: string;
  departure_date: unknown;
  departure_window: string;
  status: string;
  vibe: string | null;
  target_occupancy: number | null;
  share_code: string;
  member_count: number;
  confirmed_seats: number | string;
  lowest_quote: number | string | null;
  drill: boolean;
  crewmark_scope: string | null;
  crewmark_org: string | null;
};

export async function listDrops(filters: {
  origin?: string;
  destination?: string;
  date?: string;
  window?: string;
  includeDrill?: boolean;
  scope?: string;
  userId?: string;
}) {
  const clauses = [filters.includeDrill ? "true" : "dr.drill = false"];
  const params: unknown[] = [];
  if (filters.scope) {
    const scope = normalizeScope(filters.scope);
    params.push(scope);
    clauses.push(`coalesce(dr.crewmark_scope, 'open') = $${params.length}`);
    if (scope === "campus" || scope === "tech_park" || scope === "tier3") {
      const actor = filters.userId ? await loadActor(filters.userId) : null;
      params.push(actor?.organisation ?? "");
      clauses.push(`lower(coalesce(dr.crewmark_org, '')) = lower($${params.length})`);
    }
  }
  if (filters.origin) {
    params.push(filters.origin);
    clauses.push(`lower(rt.origin) = lower($${params.length})`);
  }
  if (filters.destination) {
    params.push(filters.destination);
    clauses.push(`lower(rt.destination) = lower($${params.length})`);
  }
  if (filters.date) {
    params.push(filters.date);
    clauses.push(`dr.departure_date = $${params.length}`);
  }
  if (filters.window) {
    params.push(filters.window);
    clauses.push(`dr.departure_window = $${params.length}`);
  }
  const rows = await query<RoomRow>(roomSelect(clauses.join(" and ")), params);
  return rows.map(mapRoom);
}

export async function getDrop(roomId: string, userId?: string) {
  const rooms = await query<RoomRow>(roomSelect("(dr.id::text = $1 or dr.share_code = $1)"), [roomId]);
  const room = rooms[0];
  if (!room) return null;
  const members = await query<{
    id: string;
    name: string;
    seats: number;
    commitment_status: string;
    affiliation_status: string | null;
    offered_fare: number | null;
  }>(
    `select p.id, p.name, m.seats, m.commitment_status, p.affiliation_status, m.offered_fare
     from drop_members m
     join profiles p on p.id = m.passenger_id
     where m.room_id = $1 and m.commitment_status <> 'left'
     order by m.commitment_status desc, p.name`,
    [room.id],
  );
  const bids = await query<Record<string, unknown>>(
    `select ob.id, ob.operator_id, ob.vehicle_id, ob.fixed_quote, ob.pickup_point, ob.departure_time,
            ob.toll_included, ob.driver_allowance_included, ob.status, ob.transcript,
            p.name as operator_name, op.verification_status, op.demo_label,
            v.type as vehicle_type, v.capacity, v.registration, v.verification_status as vehicle_verification,
            (select coalesce(sum(b.seats), 0) from bookings b
              where b.bid_id = ob.id and b.status in ${HOLDING_SQL}) as confirmed_seats
     from operator_bids ob
     join profiles p on p.id = ob.operator_id
     join operator_profiles op on op.id = ob.operator_id
     join vehicles v on v.id = ob.vehicle_id
     where ob.room_id = $1 and ob.status <> 'withdrawn'
     order by ob.fixed_quote asc`,
    [room.id],
  );
  const mine = userId
    ? await query<{ id: string; status: string; bid_id: string | null; seats: number }>(
        `select id, status, bid_id, seats from bookings
         where room_id = $1 and passenger_id = $2 and status not in ('cancelled', 'expired', 'refunded')`,
        [room.id, userId],
      )
    : [];
  const myBooking = mine[0] ?? null;
  return {
    room: mapRoom(room),
    members,
    bids: bids.map((bid) => mapBid(bid, myBooking)),
    my_booking: myBooking,
  };
}

export async function createOrMatch(input: {
  userId: string;
  origin: string;
  destination: string;
  travelDate: string;
  departureWindow: string;
  seats: number;
  vibe: string | null;
  offeredFare?: number | null;
  crewmark?: string | null;
}) {
  validateTrip(input);
  const flags = await getFlags(input.userId);
  const target = flags.pool_config.vehicle_thresholds.tempo_traveller;
  const scope = normalizeScope(input.crewmark);
  const actor = await loadActor(input.userId);
  const allowed = canCreateRoom(actor, scope);
  if (!allowed.ok) throw new Error(allowed.message);
  const org = scope === "open" ? null : actor.organisation;
  const domain = scope === "open" ? null : actor.domain;
  const entry = accessRoom(actor, { scope, organisation: org });
  if (!entry.ok) throw new Error(entry.message);
  const result = await transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      `select dr.id
       from drop_rooms dr
       join routes rt on rt.id = dr.route_id
       where dr.drill = false and dr.status = 'open'
         and lower(rt.origin) = lower($1)
         and lower(rt.destination) = lower($2)
         and dr.departure_date = $3
         and dr.departure_window = $4
         and coalesce(dr.crewmark_scope, 'open') = $5
         and (
           $5 in ('open', 'verified_peer')
           or lower(coalesce(dr.crewmark_org, '')) = lower(coalesce($6, ''))
         )
       limit 1`,
      [input.origin, input.destination, input.travelDate, input.departureWindow, scope, org],
    );
    if (existing[0]) {
      await joinInTx(tx, existing[0].id, input.userId, input.seats, input.offeredFare);
      return { roomId: existing[0].id, matched: true };
    }
    const route = await tx.query<{ id: string }>(
      `insert into routes (origin, destination, corridor)
       values ($1, $2, $3)
       on conflict (origin, destination) do update set corridor = excluded.corridor
       returning id`,
      [input.origin, input.destination, `${input.origin} outbound`],
    );
    const share = randomBytes(3).toString("hex");
    const created = await tx.query<{ id: string }>(
      `insert into drop_rooms (
         route_id, departure_date, departure_window, created_by, vibe, target_occupancy, share_code,
         crewmark_scope, crewmark_org, crewmark_domain
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [route[0].id, input.travelDate, input.departureWindow, input.userId, input.vibe, target, share, scope, org, domain],
    );
    await joinInTx(tx, created[0].id, input.userId, input.seats, input.offeredFare);
    return { roomId: created[0].id, matched: false };
  });
  await recordEvent(input.userId, result.matched ? "room_joined" : "room_created", {
    roomId: result.roomId,
  });
  return result;
}

export async function joinDrop(roomId: string, userId: string, seats: number, offeredFare?: number | null) {
  const detail = await getDrop(roomId);
  if (!detail || detail.room.drill || detail.room.status !== "open") {
    throw new Error("room_unavailable");
  }
  const actor = await loadActor(userId);
  const gate = accessRoom(actor, {
    scope: normalizeScope(detail.room.crewmark_scope),
    organisation: detail.room.crewmark_org,
  });
  if (!gate.ok) throw new Error(gate.message);
  await transaction(async (tx) => joinInTx(tx, detail.room.id, userId, seats, offeredFare));
  await recordEvent(userId, "room_joined", { roomId });
  return { roomId };
}

export async function leaveDrop(roomId: string, userId: string) {
  const rows = await query<{ status: string }>(
    `select status from bookings
     where room_id = $1 and passenger_id = $2 and status not in ('cancelled', 'expired', 'refunded')`,
    [roomId, userId],
  );
  const status = rows[0]?.status;
  if (status === "departed" || status === "completed") throw new Error("trip_already_started");
  await transaction(async (tx) => {
    await tx.query(
      `update bookings set status = 'cancelled'
       where room_id = $1 and passenger_id = $2 and status not in ('cancelled', 'expired', 'refunded', 'departed', 'completed')`,
      [roomId, userId],
    );
    await tx.query(
      `update drop_members set commitment_status = 'left' where room_id = $1 and passenger_id = $2`,
      [roomId, userId],
    );
  });
  return { ok: true };
}

export async function submitBid(input: {
  operatorId: string;
  roomId: string;
  vehicleId: string;
  fixedQuote: number;
  pickupPoint: string;
  departureTime: string;
  tollIncluded: boolean;
  driverAllowanceIncluded: boolean;
  transcript: string | null;
}) {
  if (!Number.isFinite(input.fixedQuote) || input.fixedQuote <= 0) throw new Error("quote_required");
  if (!input.pickupPoint.trim()) throw new Error("pickup_required");
  if (!/^\d{2}:\d{2}$/.test(input.departureTime)) throw new Error("time_required");
  const operators = await query<{ verification_status: string }>(
    `select verification_status from operator_profiles where id = $1`,
    [input.operatorId],
  );
  if (operators[0]?.verification_status !== "verified") throw new Error("operator_not_verified");
  const vehicles = await query<{ id: string; capacity: number; verification_status: string }>(
    `select id, capacity, verification_status from vehicles where id = $1 and operator_id = $2`,
    [input.vehicleId, input.operatorId],
  );
  const vehicle = vehicles[0];
  if (!vehicle || vehicle.verification_status !== "verified") throw new Error("vehicle_not_verified");
  const rooms = await query<{ id: string }>(
    `select id from drop_rooms where id = $1 and drill = false and status = 'open'`,
    [input.roomId],
  );
  if (!rooms[0]) throw new Error("room_unavailable");
  const rows = await query<{ id: string }>(
    `insert into operator_bids (
      room_id, operator_id, vehicle_id, fixed_quote, inclusions, pickup_point, departure_time,
      toll_included, driver_allowance_included, transcript
    ) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
    returning id`,
    [
      input.roomId,
      input.operatorId,
      input.vehicleId,
      input.fixedQuote,
      JSON.stringify({
        toll_included: input.tollIncluded,
        driver_allowance_included: input.driverAllowanceIncluded,
      }),
      input.pickupPoint.trim(),
      input.departureTime,
      input.tollIncluded,
      input.driverAllowanceIncluded,
      input.transcript,
    ],
  );
  return { bidId: rows[0].id, capacity: vehicle.capacity };
}

export async function selectBid(roomId: string, bidId: string, userId: string) {
  const bids = await query<{ id: string }>(
    `select id from operator_bids where id = $1 and room_id = $2 and status in ('submitted', 'selected', 'accepted')`,
    [bidId, roomId],
  );
  if (!bids[0]) throw new Error("bid_not_found");
  const updated = await query<{ id: string; status: string }>(
    `update bookings
     set bid_id = $1, status = 'offer_received'
     where room_id = $2 and passenger_id = $3 and status in ('interested', 'offer_received')
     returning id, status`,
    [bidId, roomId, userId],
  );
  if (!updated[0]) {
    const existing = await query<{ status: string }>(
      `select status from bookings
       where room_id = $1 and passenger_id = $2 and status not in ('cancelled', 'expired', 'refunded')`,
      [roomId, userId],
    );
    if (existing[0]) throw new Error("already_committed");
    throw new Error("join_before_selecting");
  }
  return updated[0];
}

export async function listOperatorVehicles(operatorId: string) {
  return query(
    `select id, type, capacity, registration, verification_status from vehicles where operator_id = $1 order by capacity`,
    [operatorId],
  );
}

export async function recordEvent(userId: string, eventName: string, metadata: Record<string, unknown> = {}) {
  const flags = await getFlags(userId);
  await query(
    `insert into product_events (user_id, event_name, variant, metadata) values ($1, $2, $3, $4::jsonb)`,
    [userId, eventName, flags.voice_launch_experiment, JSON.stringify(metadata)],
  );
  return flags.voice_launch_experiment;
}

async function joinInTx(tx: DbClient, roomId: string, userId: string, seats: number, offeredFare?: number | null) {
  const safeSeats = Math.min(Math.max(Math.round(seats) || 1, 1), 20);
  const fare = offeredFare && offeredFare > 0 ? Math.round(offeredFare) : null;
  await tx.query(
    `insert into drop_members (room_id, passenger_id, seats, commitment_status, offered_fare)
     values ($1, $2, $3, 'interested', $4)
     on conflict (room_id, passenger_id) do update
     set seats = case when drop_members.commitment_status = 'committed' then drop_members.seats else excluded.seats end,
         commitment_status = case when drop_members.commitment_status = 'left' then 'interested' else drop_members.commitment_status end,
         offered_fare = coalesce(excluded.offered_fare, drop_members.offered_fare)`,
    [roomId, userId, safeSeats, fare],
  );
  const active = await tx.query(
    `select id from bookings
     where room_id = $1 and passenger_id = $2 and status not in ('cancelled', 'expired', 'refunded')`,
    [roomId, userId],
  );
  if (!active[0]) {
    await tx.query(
      `insert into bookings (room_id, passenger_id, status, idempotency_key, seats)
       values ($1, $2, 'interested', $3, $4)`,
      [roomId, userId, `join:${roomId}:${userId}:${randomUUID()}`, safeSeats],
    );
  }
}

function roomSelect(where: string) {
  return `select dr.id, rt.origin, rt.destination, rt.corridor, dr.departure_date::text as departure_date, dr.departure_window,
            dr.status, dr.vibe, dr.target_occupancy, dr.share_code, dr.drill, dr.crewmark_scope, dr.crewmark_org,
            (select count(*) from drop_members m where m.room_id = dr.id and m.commitment_status <> 'left') as member_count,
            (select coalesce(sum(b.seats), 0) from bookings b where b.room_id = dr.id and b.status in ${HOLDING_SQL}) as confirmed_seats,
            (select min(ob.fixed_quote) from operator_bids ob where ob.room_id = dr.id and ob.status <> 'withdrawn') as lowest_quote
     from drop_rooms dr
     join routes rt on rt.id = dr.route_id
     where ${where}
     order by dr.departure_date, dr.created_at`;
}

function mapRoom(row: RoomRow) {
  return {
    ...row,
    departure_date: asDate(row.departure_date),
    member_count: asNumber(row.member_count),
    confirmed_seats: asNumber(row.confirmed_seats),
    lowest_quote: row.lowest_quote === null ? null : asNumber(row.lowest_quote),
    target_occupancy: row.target_occupancy === null ? null : asNumber(row.target_occupancy),
  };
}

function mapBid(row: Record<string, unknown>, mine: { status: string; bid_id: string | null } | null) {
  const confirmed = asNumber(row.confirmed_seats);
  const capacity = asNumber(row.capacity);
  const quote = asNumber(row.fixed_quote);
  const type = String(row.vehicle_type);
  return {
    id: String(row.id),
    operator_id: String(row.operator_id),
    operator_name: String(row.operator_name),
    demo_label: row.demo_label ? String(row.demo_label) : null,
    verification_status: String(row.verification_status),
    vehicle_id: String(row.vehicle_id),
    vehicle_type: type,
    vehicle_label: VEHICLE_LABELS[type] ?? type,
    capacity,
    registration: row.registration ? String(row.registration) : null,
    vehicle_verification: String(row.vehicle_verification),
    fixed_quote: quote,
    pickup_point: row.pickup_point ? String(row.pickup_point) : null,
    departure_time: row.departure_time ? String(row.departure_time) : null,
    toll_included: Boolean(row.toll_included),
    driver_allowance_included: Boolean(row.driver_allowance_included),
    status: String(row.status),
    transcript: row.transcript ? String(row.transcript) : null,
    confirmed_seats: confirmed,
    remaining_seats: remainingSeats(capacity, confirmed),
    fare_per_seat: farePerPassenger(quote, confirmed),
    full_vehicle_fare: fullVehicleProjection(quote, capacity),
    price_final: Boolean(mine && mine.bid_id === row.id && mine.status === "confirmed"),
  };
}

function validateTrip(input: { origin: string; destination: string; travelDate: string; departureWindow: string; seats: number }) {
  if (!input.origin.trim() || !input.destination.trim()) throw new Error("route_required");
  if (input.origin.trim().toLowerCase() === input.destination.trim().toLowerCase()) throw new Error("route_required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.travelDate)) throw new Error("date_required");
  if (!["morning", "afternoon", "evening", "night"].includes(input.departureWindow)) throw new Error("window_required");
  if (input.seats < 1) throw new Error("seats_required");
}

export function newId() {
  return randomUUID();
}

export function readJsonColumn<T>(value: unknown) {
  return jsonValue<T>(value);
}
