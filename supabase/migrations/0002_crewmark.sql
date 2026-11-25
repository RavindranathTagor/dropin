-- Crewmark columns. Safe to run more than once.

alter table profiles add column if not exists trust_tier integer not null default 1;
alter table profiles add column if not exists crewmark_badge text;
alter table profiles add column if not exists organisation_name text;
alter table profiles add column if not exists organisation_domain text;
alter table profiles add column if not exists email_verified_at timestamptz;

alter table drop_rooms add column if not exists crewmark_scope text not null default 'open';
alter table drop_rooms add column if not exists crewmark_org text;
alter table drop_rooms add column if not exists crewmark_domain text;

create table if not exists crewmark_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crewmark_otps_user_idx on crewmark_otps (user_id, created_at desc);
