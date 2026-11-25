import { advanceJourney } from "@/lib/bookings";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser(["operator"]);
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as { booking_id?: string; event_type?: "departed" | "completed" };
    if (!body.booking_id || (body.event_type !== "departed" && body.event_type !== "completed")) {
      return bad(new Error("milestone_required"));
    }
    const result = await advanceJourney({
      operatorId: auth.user.id,
      bookingId: body.booking_id,
      eventType: body.event_type,
    });
    return ok(result);
  } catch (error) {
    return bad(error);
  }
}
