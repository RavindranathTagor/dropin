import { CITIES, type City } from "@/lib/cities";
import { farePerPassenger } from "@/lib/pricing";
import { formatInr } from "@/lib/format";

export type TierId = "sedan" | "tempo" | "bus";

export const TIERS = [
  {
    id: "sedan" as const,
    seats: 4,
    label: "Sedan",
    ratePerKm: 13,
    allowance: 350,
    detail: "Published outstation cards are about ₹12–13/km for a sedan, plus a driver allowance.",
  },
  {
    id: "tempo" as const,
    seats: 12,
    label: "Tempo traveller",
    ratePerKm: 24,
    allowance: 500,
    detail: "Published 12-seat tempo cards run about ₹22–26/km. This uses ₹24.",
  },
  {
    id: "bus" as const,
    seats: 20,
    label: "Mini bus",
    ratePerKm: 28,
    allowance: 500,
    detail: "A published 20-seat card is about ₹28/km, plus a driver allowance.",
  },
];

const ROADS: Record<string, number> = {
  "bengaluru|mangaluru": 352,
  "bengaluru|mysuru": 145,
  "bengaluru|hubballi": 410,
  "bengaluru|hyderabad": 570,
  "bengaluru|chennai": 345,
  "bengaluru|kochi": 545,
  "bengaluru|udupi": 405,
  "bengaluru|goa": 560,
  "kochi|mangaluru": 420,
  "mangaluru|mysuru": 260,
  "mangaluru|udupi": 58,
};

const TOLLS: Record<string, number> = {
  "bengaluru|mangaluru": 250,
};

export function canonicalCity(name: string) {
  const needle = name.trim().toLowerCase();
  const hit = CITIES.find(
    (city) => city.canonical.toLowerCase() === needle || city.aliases.some((alias) => alias.toLowerCase() === needle),
  );
  return hit?.canonical ?? name.trim();
}

export function cityRecord(name: string): City | null {
  const canonical = canonicalCity(name);
  return CITIES.find((city) => city.canonical === canonical) ?? null;
}

export function cityPoint(name: string) {
  const city = cityRecord(name);
  if (!city) return null;
  return { lat: city.lat, lng: city.lng };
}

function pairKey(origin: string, destination: string) {
  return [canonicalCity(origin).toLowerCase(), canonicalCity(destination).toLowerCase()].sort().join("|");
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function roadDistance(origin: string, destination: string) {
  const published = ROADS[pairKey(origin, destination)];
  if (published) return { km: published, source: "published" as const };
  const from = cityPoint(origin);
  const to = cityPoint(destination);
  if (!from || !to) return { km: null, source: "unknown" as const };
  return { km: Math.round(haversineKm(from, to) * 1.25), source: "estimated" as const };
}

export function tollEstimate(origin: string, destination: string) {
  return TOLLS[pairKey(origin, destination)] ?? null;
}

export function priceTier(km: number, tierId: TierId, toll: number | null) {
  const tier = TIERS.find((item) => item.id === tierId);
  if (!tier || !Number.isFinite(km) || km <= 0) return null;
  const billableKm = Math.round(km);
  const vehicleTotal = Math.round(billableKm * tier.ratePerKm + tier.allowance);
  return {
    ...tier,
    km: billableKm,
    billableKm,
    vehicleTotal,
    perSeat: farePerPassenger(vehicleTotal, tier.seats),
    toll,
  };
}

export function charterGuide(origin: string, destination: string, tierId: TierId) {
  const distance = roadDistance(origin, destination);
  if (distance.km === null) return null;
  const priced = priceTier(distance.km, tierId, tollEstimate(origin, destination));
  if (!priced) return null;
  return { ...priced, distanceSource: distance.source };
}

export function shareCopy(input: {
  origin: string;
  destination: string;
  when: string;
  quote: number;
  held: number;
  targetSeats: number;
  guide?: boolean;
}) {
  const target = Math.max(1, input.targetSeats);
  const held = Math.max(0, input.held);
  const to = farePerPassenger(input.quote, target);
  const kind = input.guide ? "distance guide" : "operator quote";
  if (held === 0) {
    return `${input.origin} → ${input.destination}, ${input.when}. The ${kind} is ${formatInr(input.quote)} for the vehicle. ${target} seats would make it ${formatInr(to)} a seat. Nobody has held a seat yet.`;
  }
  const from = farePerPassenger(input.quote, held);
  const more = target - held;
  if (more <= 0) {
    return `${held} ${held === 1 ? "seat is" : "seats are"} held. The split of the ${kind} is ${formatInr(from)} a seat.`;
  }
  const seats = more === 1 ? "seat" : "seats";
  return `${more} more ${seats} on ${input.when} ${input.origin} → ${input.destination} takes the split from ${formatInr(from)} to ${formatInr(to)}. The ${kind} stays ${formatInr(input.quote)} for the vehicle.`;
}
