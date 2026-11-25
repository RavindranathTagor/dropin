import { getDrop, submitBid } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const drop = await getDrop(id, auth.user.id);
    if (!drop) return bad(new Error("room_not_found"), 404);
    return ok({ ok: true, bids: drop.bids });
  } catch (error) {
    return bad(error, 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser(["operator"]);
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const body = (await request.json()) as {
      vehicle_id?: string;
      fixed_total_quote?: number;
      pickup_point?: string;
      departure_time?: string;
      toll_included?: boolean;
      driver_allowance_included?: boolean;
      transcript?: string | null;
    };
    const result = await submitBid({
      operatorId: auth.user.id,
      roomId: id,
      vehicleId: body.vehicle_id || "",
      fixedQuote: Number(body.fixed_total_quote),
      pickupPoint: body.pickup_point || "",
      departureTime: body.departure_time || "",
      tollIncluded: Boolean(body.toll_included),
      driverAllowanceIncluded: Boolean(body.driver_allowance_included),
      transcript: body.transcript || null,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return bad(error);
  }
}
