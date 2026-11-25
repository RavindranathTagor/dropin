import { listDrops, listOperatorVehicles } from "@/lib/drops";
import { query } from "@/lib/db";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function GET() {
  try {
    const auth = await withUser(["operator"]);
    if (auth.error || !auth.user) return reject(auth);
    const [vehicles, rooms, trips] = await Promise.all([
      listOperatorVehicles(auth.user.id),
      listDrops({}),
      query(
        `select b.id, b.status, p.name as passenger_name, rt.origin, rt.destination,
                ob.id as bid_id, ob.pickup_point, ob.departure_time, dr.id as room_id
         from bookings b
         join operator_bids ob on ob.id = b.bid_id
         join profiles p on p.id = b.passenger_id
         join drop_rooms dr on dr.id = b.room_id
         join routes rt on rt.id = dr.route_id
         where ob.operator_id = $1
           and b.status in ('commitment_pending', 'minimum_occupancy_reached', 'operator_accepted', 'confirmed', 'departed')
         order by b.created_at desc`,
        [auth.user.id],
      ),
    ]);
    return ok({ ok: true, vehicles, rooms, trips });
  } catch (error) {
    return bad(error, 500);
  }
}
