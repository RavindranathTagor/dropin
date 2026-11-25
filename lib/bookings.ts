import { HOLDING_SQL } from "@/lib/constants";
import { jsonValue, query } from "@/lib/db";
import { getFlags } from "@/lib/flags";
import { recordEvent } from "@/lib/drops";
import { recordMilestone, type Milestone } from "@/lib/amma";
import { assertCrewmarkHold } from "@/lib/crewmark";

export type CommitResult = {
  ok: boolean;
  error?: string;
  idempotent?: boolean;
  booking_id?: string;
  status?: string;
  confirmed_seats?: number;
  capacity?: number;
  remaining?: number;
};

export async function commitBooking(input: {
  userId: string;
  roomId: string;
  bidId: string;
  seats: number;
  idempotencyKey: string;
  source?: string;
  dispatch?: boolean;
}) {
  const flags = await getFlags(input.userId);
  const controls = await query<{ booking_writes_paused: boolean }>(
    `select booking_writes_paused from ops_controls where id = 1`,
  );
  const started = Date.now();
  const source = input.source ?? "user";
  if (flags.booking_writes_paused || controls[0]?.booking_writes_paused) {
    await logAttempt({
      ...input,
      source,
      outcome: "paused",
      errorCode: "booking_writes_paused",
      latencyMs: Date.now() - started,
      remaining: null,
    });
    return { ok: false, error: "booking_writes_paused" } satisfies CommitResult;
  }

  const gate = await assertCrewmarkHold(input.userId, input.roomId);
  if (!gate.ok) {
    await logAttempt({
      ...input,
      source,
      outcome: "failed",
      errorCode: gate.code,
      latencyMs: Date.now() - started,
      remaining: null,
    });
    return { ok: false, error: gate.message } satisfies CommitResult;
  }

  const rows = await query<{ result: unknown }>(
    `select commit_booking($1, $2, $3, $4, $5, $6) as result`,
    [
      input.roomId,
      input.bidId,
      input.userId,
      input.idempotencyKey,
      input.seats,
      flags.pool_config.minimum_confirmation_ratio,
    ],
  );
  const result = jsonValue<CommitResult>(rows[0]?.result);
  await logAttempt({
    ...input,
    source,
    outcome: result.ok ? "success" : "failed",
    errorCode: result.error ?? null,
    latencyMs: Date.now() - started,
    remaining: result.remaining ?? null,
  });
  if (result.ok && !result.idempotent && source !== "demo_load") {
    await recordEvent(input.userId, "commitment_completed", { roomId: input.roomId, bidId: input.bidId });
  }
  if (result.ok && result.booking_id && result.status === "confirmed") {
    await recordMilestone(result.booking_id, "confirmed", input.userId);
  }
  return result;
}

export async function acceptOperatorBid(bidId: string, operatorId: string) {
  const rows = await query<{ result: unknown }>(`select accept_bid($1, $2) as result`, [bidId, operatorId]);
  const result = jsonValue<{ ok: boolean; error?: string; room_id?: string }>(rows[0]?.result);
  if (!result.ok) return result;
  const progressed = await query<{ id: string; status: Milestone }>(
    `select b.id, b.status from bookings b
     where b.bid_id = $1 and b.status in ('confirmed', 'operator_accepted')
       and not exists (
         select 1 from journey_events e where e.booking_id = b.id and e.event_type = b.status
       )`,
    [bidId],
  );
  for (const booking of progressed) {
    await recordMilestone(booking.id, booking.status, operatorId);
  }
  await query(
    `insert into audit_logs (actor_id, action, resource_id, metadata) values ($1, 'bid_accepted', $2, '{}'::jsonb)`,
    [operatorId, bidId],
  );
  return result;
}

export async function advanceJourney(input: { operatorId: string; bookingId: string; eventType: "departed" | "completed" }) {
  const rows = await query<{ status: string; operator_id: string }>(
    `select b.status, ob.operator_id
     from bookings b
     join operator_bids ob on ob.id = b.bid_id
     where b.id = $1`,
    [input.bookingId],
  );
  const booking = rows[0];
  if (!booking) throw new Error("booking_not_found");
  if (booking.operator_id !== input.operatorId) throw new Error("not_allowed");
  const expected = input.eventType === "departed" ? "confirmed" : "departed";
  if (booking.status !== expected) throw new Error("milestone_not_ready");
  const updated = await query<{ id: string }>(
    `update bookings set status = $1 where id = $2 and status = $3 returning id`,
    [input.eventType, input.bookingId, expected],
  );
  if (!updated[0]) throw new Error("milestone_not_ready");
  await recordMilestone(input.bookingId, input.eventType, input.operatorId);
  return { ok: true, status: input.eventType };
}

async function logAttempt(input: {
  roomId: string;
  bidId: string;
  userId: string;
  idempotencyKey: string;
  source: string;
  outcome: string;
  errorCode: string | null;
  latencyMs: number;
  remaining: number | null;
}) {
  await query(
    `insert into booking_attempts (
      room_id, bid_id, passenger_id, idempotency_key, outcome, latency_ms, error_code, remaining_seats, source
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.roomId,
      input.bidId,
      input.userId,
      input.idempotencyKey,
      input.outcome,
      input.latencyMs,
      input.errorCode,
      input.remaining,
      input.source,
    ],
  );
  console.log(
    JSON.stringify({
      source: "ghardrop",
      type: "booking_attempt",
      outcome: input.outcome,
      error_code: input.errorCode,
      latency_ms: input.latencyMs,
      room_id: input.roomId,
      bid_id: input.bidId,
      remaining_seats: input.remaining,
      attempt_source: input.source,
      ts: new Date().toISOString(),
    }),
  );
}

export async function bookingHealth() {
  const rows = await query<{ outcome: string; latency_ms: number | null }>(
    `select outcome, latency_ms from booking_attempts order by created_at desc limit 10`,
  );
  const failures = rows.filter((row) => row.outcome !== "success").length;
  const latencies = rows.map((row) => row.latency_ms ?? 0).sort((a, b) => a - b);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : 0;
  const paused = await query<{ booking_writes_paused: boolean }>(
    `select booking_writes_paused from ops_controls where id = 1`,
  );
  const held = await query<{ count: string }>(
    `select count(*)::text as count from bookings where status in ${HOLDING_SQL}`,
  );
  return {
    recent_attempts: rows.length,
    recent_failures: failures,
    p95_latency_ms: p95,
    booking_writes_paused: Boolean(paused[0]?.booking_writes_paused),
    active_bookings: Number(held[0]?.count ?? 0),
  };
}
