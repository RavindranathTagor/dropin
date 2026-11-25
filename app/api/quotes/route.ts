import { NextResponse } from "next/server";
import { canonicalCity, cityPoint, priceTier, roadDistance, TIERS, tollEstimate } from "@/lib/distance";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = canonicalCity(url.searchParams.get("origin") || "");
  const destination = canonicalCity(url.searchParams.get("destination") || "");
  const from = cityPoint(origin);
  const to = cityPoint(destination);
  if (!from || !to || origin.toLowerCase() === destination.toLowerCase()) {
    return NextResponse.json({ ok: false, error: "pick_two_cities" }, { status: 400 });
  }

  let km: number | null = null;
  let minutes: number | null = null;
  let source: "route" | "published" | "estimated" = "published";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (response.ok) {
      const json = (await response.json()) as { routes?: { distance?: number; duration?: number }[] };
      const route = json.routes?.[0];
      if (route?.distance) {
        km = Math.max(1, Math.round(route.distance / 1000));
        minutes = Math.max(1, Math.round((route.duration || 0) / 60));
        source = "route";
      }
    }
  } catch {
    km = null;
  }

  if (km === null) {
    const fallback = roadDistance(origin, destination);
    km = fallback.km;
    source = fallback.source === "unknown" ? "estimated" : fallback.source;
  }
  if (km === null) return NextResponse.json({ ok: false, error: "no_route" }, { status: 404 });

  const toll = tollEstimate(origin, destination);
  const quotes = TIERS.map((tier) => priceTier(km, tier.id, toll)).filter((item) => item !== null);
  return NextResponse.json({ ok: true, origin, destination, km, minutes, source, toll, quotes });
}
