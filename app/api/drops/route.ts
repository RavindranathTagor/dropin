import { createOrMatch, listDrops } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const url = new URL(request.url);
    const rooms = await listDrops({
      origin: url.searchParams.get("origin") || undefined,
      destination: url.searchParams.get("destination") || undefined,
      date: url.searchParams.get("date") || undefined,
      window: url.searchParams.get("window") || undefined,
      includeDrill: auth.user.role === "admin" && url.searchParams.get("drill") === "1",
      scope: url.searchParams.get("scope") || undefined,
      userId: auth.user.id,
    });
    return ok({ ok: true, rooms });
  } catch (error) {
    return bad(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as {
      origin?: string;
      destination?: string;
      travel_date?: string;
      departure_window?: string;
      seats?: number;
      vibe?: string | null;
      offered_fare?: number | null;
      crewmark?: string | null;
    };
    const result = await createOrMatch({
      userId: auth.user.id,
      origin: body.origin?.trim() || "",
      destination: body.destination?.trim() || "",
      travelDate: body.travel_date || "",
      departureWindow: body.departure_window || "",
      seats: Number(body.seats || 1),
      offeredFare: body.offered_fare,
      vibe: body.vibe || null,
      crewmark: body.crewmark || null,
    });
    return ok({ ok: true, ...result });
  } catch (error) {
    return bad(error);
  }
}
