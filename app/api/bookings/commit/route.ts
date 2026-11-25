import { commitBooking } from "@/lib/bookings";
import { bad, ok, withUser, reject } from "@/lib/http";
import { dispatchIfUnhealthy } from "@/lib/ops";

export async function POST(request: Request) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as {
      room_id?: string;
      bid_id?: string;
      seats?: number;
      idempotency_key?: string;
    };
    if (!body.room_id || !body.bid_id || !body.idempotency_key) return bad(new Error("booking_details_required"));
    const result = await commitBooking({
      userId: auth.user.id,
      roomId: body.room_id,
      bidId: body.bid_id,
      seats: Number(body.seats || 1),
      idempotencyKey: body.idempotency_key,
      source: "user",
    });
    await dispatchIfUnhealthy("commitment_failures");
    const status = result.ok ? 200 : result.error === "booking_writes_paused" ? 423 : 409;
    return ok(result, status);
  } catch (error) {
    return bad(error, 500);
  }
}
