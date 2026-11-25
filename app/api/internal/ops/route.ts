import { evidenceBundle, pauseBookings, runContentionTest } from "@/lib/ops";
import { bad, ok, withOps, reject } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const auth = await withOps(request);
    if (auth.error) return reject(auth);
    return ok({ ok: true, ...(await evidenceBundle()) });
  } catch (error) {
    return bad(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await withOps(request);
    if (auth.error) return reject(auth);
    const body = (await request.json()) as { paused?: boolean; reason?: string; action?: string };
    if (body.action === "contention") {
      const result = await runContentionTest(auth.user?.id || "ops-secret");
      return ok({ ok: true, ...result });
    }
    const result = await pauseBookings({
      paused: Boolean(body.paused),
      reason: body.reason || (body.paused ? "Paused from the ops endpoint" : "Resumed"),
      actorId: auth.user?.id || null,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return bad(error, 500);
  }
}
