import { getDrop, selectBid } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const bid = await queryBidRoom(id);
    if (!bid) return bad(new Error("bid_not_found"), 404);
    const selected = await selectBid(bid.room_id, id, auth.user.id);
    return ok({ ok: true, booking: selected });
  } catch (error) {
    return bad(error);
  }
}

async function queryBidRoom(bidId: string) {
  const { query } = await import("@/lib/db");
  const rows = await query<{ room_id: string }>(`select room_id from operator_bids where id = $1`, [bidId]);
  return rows[0] ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const bid = await queryBidRoom(id);
    if (!bid) return bad(new Error("bid_not_found"), 404);
    const drop = await getDrop(bid.room_id, auth.user.id);
    return ok({ ok: true, bid: drop?.bids.find((item) => item.id === id) ?? null });
  } catch (error) {
    return bad(error, 500);
  }
}
