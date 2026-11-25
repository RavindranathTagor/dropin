import { PRODUCT_EVENTS } from "@/lib/constants";
import { recordEvent } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as { name?: string };
    if (!body.name || !PRODUCT_EVENTS.includes(body.name as (typeof PRODUCT_EVENTS)[number])) {
      return bad(new Error("event_not_allowed"));
    }
    if (body.name !== "search_started" && body.name !== "search_completed") {
      return bad(new Error("event_not_allowed"));
    }
    const variant = await recordEvent(auth.user.id, body.name);
    return ok({ ok: true, variant });
  } catch (error) {
    return bad(error, 500);
  }
}
