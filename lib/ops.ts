import { randomUUID } from "crypto";
import { DRILL_BID_ID, DRILL_ROOM_ID } from "@/lib/constants";
import { query } from "@/lib/db";
import { tryEnablePauseFlag } from "@/lib/flags";
import { bookingHealth, commitBooking } from "@/lib/bookings";

const LOAD_HASH = "scrypt:ghardrop-demo-salt-01:b3f6236c8312cd76ece14150476ece8617fe9de5bd687aef433146e490f5971e";

let nudgeCache: { at: number; value: Awaited<ReturnType<typeof probeNudgebee>> } | null = null;

export async function pauseBookings(input: { paused: boolean; reason: string; actorId: string | null }) {
  await query(
    `update ops_controls set booking_writes_paused = $1, pause_reason = $2, updated_at = now() where id = 1`,
    [input.paused, input.reason],
  );
  const flag = input.paused ? await tryEnablePauseFlag() : { updated: false, reason: "resume_is_local" };
  await query(
    `insert into audit_logs (actor_id, action, resource_id, metadata) values ($1, $2, 'ops_controls', $3::jsonb)`,
    [
      input.actorId,
      input.paused ? "pause_bookings" : "resume_bookings",
      JSON.stringify({ reason: input.reason, flagsmith: flag }),
    ],
  );
  return { booking_writes_paused: input.paused, flagsmith: flag };
}

export async function evidenceBundle() {
  const attempts = await query(
    `select id, room_id, bid_id, outcome, latency_ms, error_code, remaining_seats, source, created_at
     from booking_attempts
     order by created_at desc
     limit 30`,
  );
  const dispatches = await query(
    `select id, payload, response_status, response_body, connected, created_at
     from nudgebee_dispatches
     order by created_at desc
     limit 5`,
  );
  const audits = await query(
    `select id, actor_id, action, resource_id, metadata, created_at
     from audit_logs
     order by created_at desc
     limit 12`,
  );
  const health = await bookingHealth();
  const nudgebee = await nudgebeeStatus();
  return {
    health,
    attempts,
    dispatches,
    audits,
    nudgebee,
    note: nudgebee.lastDelivered ? "Delivered" : "Waiting",
  };
}

export async function dispatchIfUnhealthy(reason: string, force = false) {
  const health = await bookingHealth();
  if (!force && health.recent_failures < 3) return { dispatched: false, reason: "below_threshold" };
  const latest = await query<{ created_at: string }>(
    `select created_at from nudgebee_dispatches order by created_at desc limit 1`,
  );
  if (!force && latest[0] && Date.now() - new Date(latest[0].created_at).getTime() < 120_000) {
    return { dispatched: false, reason: "debounced" };
  }
  return sendWebhook(reason, health);
}

export async function runContentionTest(actorId: string) {
  const run = randomUUID();
  await query(
    `update bookings set status = 'cancelled'
     where room_id = $1 and status not in ('cancelled', 'expired', 'refunded')`,
    [DRILL_ROOM_ID],
  );
  await query(`update drop_members set commitment_status = 'left' where room_id = $1`, [DRILL_ROOM_ID]);
  const passengers: string[] = [];
  for (let index = 1; index <= 6; index += 1) {
    const id = `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    passengers.push(id);
    await query(
      `insert into profiles (id, name, email, password_hash, role, affiliation_status)
       values ($1, $2, $3, $4, 'passenger', 'Load-test passenger for the labelled ops drill.')
       on conflict (id) do nothing`,
      [id, `Load passenger ${index}`, `load${index}@ghardrop.dev`, LOAD_HASH],
    );
    await query(
      `insert into drop_members (room_id, passenger_id, seats, commitment_status)
       values ($1, $2, 1, 'interested')
       on conflict (room_id, passenger_id) do update set commitment_status = 'interested', seats = 1`,
      [DRILL_ROOM_ID, id],
    );
    await query(
      `insert into bookings (room_id, passenger_id, status, idempotency_key, seats)
       values ($1, $2, 'interested', $3, 1)`,
      [DRILL_ROOM_ID, id, `drill-join:${run}:${id}`],
    );
  }

  const results = await Promise.all(
    passengers.map((passengerId) =>
      commitBooking({
        userId: passengerId,
        roomId: DRILL_ROOM_ID,
        bidId: DRILL_BID_ID,
        seats: 1,
        idempotencyKey: `drill-commit:${run}:${passengerId}`,
        source: "demo_load",
        dispatch: false,
      }),
    ),
  );
  const dispatch = await dispatchIfUnhealthy("demo_load", true);
  await query(
    `insert into audit_logs (actor_id, action, resource_id, metadata) values ($1, 'contention_test', $2, $3::jsonb)`,
    [actorId, DRILL_ROOM_ID, JSON.stringify({ run, successes: results.filter((item) => item.ok).length })],
  );
  return {
    labelled: "demo_load",
    vehicle_capacity: 2,
    results,
    dispatch,
  };
}

async function sendWebhook(reason: string, health: Awaited<ReturnType<typeof bookingHealth>>) {
  const attempts = await query(
    `select outcome, error_code, latency_ms, remaining_seats, source, created_at
     from booking_attempts order by created_at desc limit 10`,
  );
  const payload = {
    incident_source: attempts.some((row) => row.source === "demo_load") ? "demo_load" : "booking_api",
    service: "dropin",
    summary: "Booking commitment failures",
    reason,
    health,
    attempts,
  };
  const url = process.env.NUDGEBEE_WEBHOOK_URL;
  if (!url) {
    await query(
      `insert into nudgebee_dispatches (payload, response_status, response_body, connected) values ($1::jsonb, null, $2, false)`,
      [JSON.stringify(payload), "webhook_not_configured"],
    );
    return { dispatched: true, connected: false, detail: "webhook_not_configured" };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.text()).slice(0, 500);
    await query(
      `insert into nudgebee_dispatches (payload, response_status, response_body, connected) values ($1::jsonb, $2, $3, $4)`,
      [JSON.stringify(payload), response.status, body, response.ok],
    );
    return { dispatched: true, connected: response.ok, status: response.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook_failed";
    await query(
      `insert into nudgebee_dispatches (payload, response_status, response_body, connected) values ($1::jsonb, null, $2, false)`,
      [JSON.stringify(payload), message],
    );
    return { dispatched: true, connected: false, detail: message };
  }
}

export async function nudgebeeStatus() {
  if (nudgeCache && Date.now() - nudgeCache.at < 30_000) return nudgeCache.value;
  const value = await probeNudgebee();
  nudgeCache = { at: Date.now(), value };
  return value;
}

async function probeNudgebee() {
  const webhookConfigured = Boolean(process.env.NUDGEBEE_WEBHOOK_URL);
  const tokenConfigured = Boolean(process.env.NUDGEBEE_API_TOKEN);
  const latest = await query<{ connected: boolean; response_status: number | null }>(
    `select connected, response_status from nudgebee_dispatches order by created_at desc limit 1`,
  );
  const lastDelivered = Boolean(latest[0]?.connected);
  const lastStatus = latest[0]?.response_status ?? null;
  const base = { webhookConfigured, tokenConfigured, lastDelivered, lastStatus, account: null as string | null };
  if (!tokenConfigured) {
    return { ...base, apiReachable: webhookConfigured && lastDelivered };
  }
  try {
    const response = await fetch(`${process.env.NUDGEBEE_BASE_URL || "https://app.nudgebee.com"}/api/graphql`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NUDGEBEE_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "{ accounts_list(limit: 1) { rows { id account_name } } }" }),
    });
    if (!response.ok) {
      return { ...base, apiReachable: lastDelivered };
    }
    const body = (await response.json()) as { data?: { accounts_list?: { rows?: { account_name?: string }[] } } };
    return {
      ...base,
      apiReachable: true,
      account: body.data?.accounts_list?.rows?.[0]?.account_name ?? null,
    };
  } catch {
    return { ...base, apiReachable: lastDelivered };
  }
}

export async function adminSummary() {
  const rooms = await query(
    `select dr.id, rt.origin, rt.destination, dr.departure_date::text as departure_date, dr.departure_window, dr.status, dr.drill, dr.share_code,
            (select count(*) from drop_members m where m.room_id = dr.id and m.commitment_status <> 'left') as members
     from drop_rooms dr join routes rt on rt.id = dr.route_id
     order by dr.drill, dr.departure_date`,
  );
  const bids = await query(
    `select ob.id, p.name as operator_name, ob.fixed_quote, ob.status, ob.pickup_point, v.capacity, v.type, dr.drill
     from operator_bids ob
     join profiles p on p.id = ob.operator_id
     join vehicles v on v.id = ob.vehicle_id
     join drop_rooms dr on dr.id = ob.room_id
     order by ob.created_at`,
  );
  const operators = await query(
    `select p.id, p.name, p.phone, op.verification_status, op.demo_label, op.contact_details
     from operator_profiles op join profiles p on p.id = op.id
     order by p.name`,
  );
  const bookings = await query(
    `select b.id, b.status, b.seats, p.name as passenger_name, rt.origin, rt.destination, ob.fixed_quote
     from bookings b
     join profiles p on p.id = b.passenger_id
     join drop_rooms dr on dr.id = b.room_id
     join routes rt on rt.id = dr.route_id
     left join operator_bids ob on ob.id = b.bid_id
     where b.status not in ('cancelled', 'expired', 'refunded')
     order by b.created_at desc
     limit 40`,
  );
  const funnel = await query(
    `select variant, event_name, count(*)::int as total
     from product_events
     group by variant, event_name
     order by variant, event_name`,
  );
  return { rooms, bids, operators, bookings, funnel };
}

export async function setOperatorStatus(operatorId: string, status: string, actorId: string) {
  if (!["pending", "verified", "rejected"].includes(status)) throw new Error("status_required");
  await query(`update operator_profiles set verification_status = $1 where id = $2`, [status, operatorId]);
  await query(
    `insert into audit_logs (actor_id, action, resource_id, metadata) values ($1, 'operator_review', $2, $3::jsonb)`,
    [actorId, operatorId, JSON.stringify({ status, note: "Document review state only. Demo operators stay labelled as sample records." })],
  );
  return { ok: true };
}
