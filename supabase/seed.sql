-- Demo accounts. Passwords are hashed with scrypt and are not live credentials.
-- passenger@ghardrop.dev / passenger123
-- passenger2@ghardrop.dev / passenger123
-- operator@ghardrop.dev / operator123
-- operator.malnad@ghardrop.dev / operator123
-- admin@ghardrop.dev / admin123

insert into profiles (id, name, phone, email, password_hash, role, affiliation_status)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Ravindranath',
    '9000000001',
    'passenger@ghardrop.dev',
    'scrypt:ghardrop-demo-salt-01:b3f6236c8312cd76ece14150476ece8617fe9de5bd687aef433146e490f5971e',
    'passenger',
    'College affiliation on file. This is not a safety certification.'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Imad',
    '9000000002',
    'passenger2@ghardrop.dev',
    'scrypt:ghardrop-demo-salt-01:b3f6236c8312cd76ece14150476ece8617fe9de5bd687aef433146e490f5971e',
    'passenger',
    'Employer affiliation on file. This is not a safety certification.'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Coastal Tempo Co.',
    '9000000003',
    'operator@ghardrop.dev',
    'scrypt:ghardrop-demo-salt-01:f7ef92f51be0c0a160328e2c320a37ea9fab446c6e1babce7998cee31bc946ea',
    'operator',
    null
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'Malnad Travels',
    '9000000004',
    'operator.malnad@ghardrop.dev',
    'scrypt:ghardrop-demo-salt-01:f7ef92f51be0c0a160328e2c320a37ea9fab446c6e1babce7998cee31bc946ea',
    'operator',
    null
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'Dropin Ops',
    '9000000005',
    'admin@ghardrop.dev',
    'scrypt:ghardrop-demo-salt-01:0ba8f14fd83d16c29b9024003104f82ce11d89a26fa508b3ec581db26b2d3c60',
    'admin',
    null
  )
on conflict (id) do update set name = excluded.name;

insert into operator_profiles (id, verification_status, contact_details, demo_label)
values
  (
    '33333333-3333-4333-8333-333333333333',
    'verified',
    '{"phone":"9000000003","base":"Kengeri","documents":["Identity","Vehicle registration","Permit","Insurance","Driver licence"]}'::jsonb,
    'Demo operator — sample record, not a live permit check.'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'verified',
    '{"phone":"9000000004","base":"Majestic","documents":["Identity","Vehicle registration","Permit","Insurance","Driver licence"]}'::jsonb,
    'Demo operator — sample record, not a live permit check.'
  )
on conflict (id) do nothing;

insert into vehicles (id, operator_id, type, capacity, registration, verification_status)
values
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    '33333333-3333-4333-8333-333333333333',
    'tempo_traveller',
    12,
    'KA-01-HD-1201',
    'verified'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    '44444444-4444-4444-8444-444444444444',
    'mini_bus',
    20,
    'KA-05-HD-2020',
    'verified'
  ),
  (
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    '33333333-3333-4333-8333-333333333333',
    'shared_car',
    2,
    'KA-01-HD-0002',
    'verified'
  )
on conflict (id) do nothing;

insert into routes (id, origin, destination, corridor)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'Bengaluru',
  'Mangaluru',
  'Bengaluru outbound'
)
on conflict (id) do nothing;

insert into drop_rooms (
  id, route_id, departure_date, departure_window, status, created_by, vibe, target_occupancy, share_code, drill
)
values
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-12-24',
    'night',
    'open',
    '55555555-5555-4555-8555-555555555555',
    'college_squad',
    12,
    'mangaluru-eve',
    false
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-12-24',
    'morning',
    'open',
    '55555555-5555-4555-8555-555555555555',
    null,
    2,
    'ops-drill',
    true
  )
on conflict (id) do nothing;

insert into operator_bids (
  id, room_id, operator_id, vehicle_id, fixed_quote, inclusions, pickup_point, departure_time,
  toll_included, driver_allowance_included, status
)
values
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '33333333-3333-4333-8333-333333333333',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    8500,
    '{"toll_included":true,"driver_allowance_included":false}'::jsonb,
    'Kengeri Metro',
    '22:00',
    true,
    false,
    'submitted'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    '44444444-4444-4444-8444-444444444444',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    16000,
    '{"toll_included":true,"driver_allowance_included":true}'::jsonb,
    'Majestic',
    '21:30',
    true,
    true,
    'submitted'
  ),
  (
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd3',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '33333333-3333-4333-8333-333333333333',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    2000,
    '{"toll_included":false,"driver_allowance_included":false}'::jsonb,
    'Drill only',
    '09:00',
    false,
    false,
    'submitted'
  )
on conflict (id) do nothing;

-- Demo passengers on ghardrop.dev are Verified Peers of Dropin.
-- Skipped when this file is applied before the Crewmark columns exist.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'trust_tier'
  ) then
    update profiles
    set trust_tier = 2,
        crewmark_badge = 'corporate',
        organisation_name = 'Dropin',
        organisation_domain = 'ghardrop.dev',
        email_verified_at = coalesce(email_verified_at, now())
    where email in ('passenger@ghardrop.dev', 'passenger2@ghardrop.dev');
  end if;
end $$;
