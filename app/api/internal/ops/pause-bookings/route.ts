import { pauseBookings } from "@/lib/ops";
import { bad, ok, withOps, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withOps(request);
    if (auth.error) return reject(auth);
    const body = (await request.json()) as { paused?: boolean; reason?: string };
    const paused = body.paused !== false;
    const result = await pauseBookings({
      paused,
      reason: body.reason || (paused ? "Approved ops pause" : "Resumed"),
      actorId: auth.user?.id || null,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return bad(error, 500);
  }
}
