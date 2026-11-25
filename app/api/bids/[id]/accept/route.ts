import { acceptOperatorBid } from "@/lib/bookings";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser(["operator"]);
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const result = await acceptOperatorBid(id, auth.user.id);
    if (!result.ok) return bad(new Error(result.error || "bid_not_accepted"));
    return ok(result);
  } catch (error) {
    return bad(error);
  }
}
