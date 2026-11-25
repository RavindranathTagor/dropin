import { PICKUP_POINTS } from "@/lib/constants";

export type BidDraft = {
  vehicle_type: "shared_car" | "tempo_traveller" | "mini_bus" | null;
  capacity: number | null;
  pickup_point: string | null;
  departure_time: string | null;
  fixed_total_quote: number | null;
  toll_included: boolean;
  driver_allowance_included: boolean;
  needs_confirmation: true;
};

export function parseBid(text: string): BidDraft {
  const source = text.replace(/,/g, "").replace(/\s+/g, " ").trim();
  const capacity = readCapacity(source);
  const vehicle = readVehicle(source, capacity);
  return {
    vehicle_type: vehicle,
    capacity,
    pickup_point: readPickup(source),
    departure_time: readTime(source),
    fixed_total_quote: readQuote(source, capacity),
    toll_included: /toll included/i.test(source),
    driver_allowance_included: /driver allowance included|allowance included/i.test(source) && !/allowance (extra|not included|excluded)/i.test(source),
    needs_confirmation: true,
  };
}

function readCapacity(text: string) {
  const seater = text.match(/\b(\d{1,2})\s*-?\s*seat(?:er|s)?\b/i);
  if (seater) return Number(seater[1]);
  return null;
}

function readVehicle(text: string, capacity: number | null): BidDraft["vehicle_type"] {
  if (/\btt\b|tempo|travell?er/i.test(text)) return "tempo_traveller";
  if (/mini\s*bus|minibus/i.test(text)) return "mini_bus";
  if (/\bbus\b/i.test(text)) return capacity !== null && capacity <= 14 ? "tempo_traveller" : "mini_bus";
  if (/\bcar\b|sedan|suv/i.test(text)) return "shared_car";
  if (capacity !== null && capacity <= 4) return "shared_car";
  if (capacity !== null && capacity <= 14) return "tempo_traveller";
  if (capacity !== null) return "mini_bus";
  return null;
}

function readPickup(text: string) {
  const found = PICKUP_POINTS.find((point) => text.toLowerCase().includes(point.toLowerCase()));
  if (found) return found;
  const at = text.match(/\bat\s+([A-Za-z][A-Za-z ]{2,40}?)(?:\s+\d|\s+₹|\s+rs\b|$)/i);
  return at ? at[1].trim() : null;
}

function readTime(text: string) {
  const clock = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = clock[2] ? Number(clock[2]) : 0;
    const suffix = clock[3].toLowerCase();
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) {
    return `${String(Number(twentyFour[1])).padStart(2, "0")}:${twentyFour[2]}`;
  }
  return null;
}

function readQuote(text: string, capacity: number | null) {
  const money = text.match(/(?:₹|rs\.?|rupees?|fixed)\s*(\d{3,7})/i);
  if (money) return Number(money[1]);
  const numbers = [...text.matchAll(/\b(\d{3,7})\b/g)].map((match) => Number(match[1]));
  const candidates = numbers.filter((value) => value !== capacity && value >= 500);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}
