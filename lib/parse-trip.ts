import { findCities } from "@/lib/cities";

export type DepartureWindow = "morning" | "afternoon" | "evening" | "night";

export type TripDraft = {
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
  departure_period: DepartureWindow | null;
  budget_per_person: number | null;
  group_preference: string | null;
  passengers: number | null;
  origin_assumed: boolean;
  needs_confirmation: true;
};

const WINDOWS: Array<{ id: DepartureWindow; pattern: RegExp }> = [
  { id: "night", pattern: /\b(late night|night|tonight)\b/i },
  { id: "morning", pattern: /\bmorning\b/i },
  { id: "afternoon", pattern: /\bafternoon\b/i },
  { id: "evening", pattern: /\bevening\b/i },
];

export function parseTrip(text: string, options?: { now?: Date }): TripDraft {
  const now = options?.now ?? new Date();
  const source = text.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const cities = findCities(source);
  const fromMatch = source.match(/\bfrom\s+([a-z\u0900-\u097f\u0c80-\u0cff ]+?)(?:\s+to\b|,|$)/i);

  const toMatch = source.match(/\bto\s+([a-z\u0900-\u097f\u0c80-\u0cff ]+?)(?:\s+(?:from|on|for|at|by|tonight|today|tomorrow|morning|afternoon|evening|night|with)\b|,|$)/i);

  let origin: string | null = cities[0]?.canonical ?? null;
  let destination: string | null = cities[1]?.canonical ?? null;
  let originAssumed = false;

  if (cities.length === 1) {
    const only = cities[0].canonical;
    if (/\bfrom\b/i.test(source) && !/\bto\b/i.test(source)) {
      origin = only;
      destination = null;
    } else if (only === "Bengaluru") {
      origin = null;
      destination = "Bengaluru";
    } else {
      destination = only;
      origin = "Bengaluru";
      originAssumed = true;
    }
  }

  if (fromMatch) {
    const named = findCities(fromMatch[1])[0];
    if (named) origin = named.canonical;
  }
  if (toMatch) {
    const named = findCities(toMatch[1])[0];
    if (named) destination = named.canonical;
  }
  if (origin && destination === origin) {
    const other = cities.find((city) => city.canonical !== origin);
    if (other) destination = other.canonical;
  }

  const period = WINDOWS.find((item) => item.pattern.test(source))?.id ?? null;
  const budget = readBudget(source);
  const passengers = readPassengers(source);
  const preference = readPreference(source);

  return {
    origin,
    destination,
    travel_date: readDate(source, now),
    departure_period: period,
    budget_per_person: budget,
    group_preference: preference,
    passengers,
    origin_assumed: originAssumed,
    needs_confirmation: true,
  };
}

function readBudget(text: string) {
  const labelled = text.match(/(?:budget|under|around|₹|rs\.?|rupees?)\s*₹?\s*(\d{2,7})/i);
  if (labelled) return Number(labelled[1]);
  return null;
}

function readPassengers(text: string) {
  const labelled = text.match(/\b(\d{1,2})\s*(people|passengers|seats|of us|pax)\b/i);
  if (labelled) return Number(labelled[1]);
  const squad = text.match(/\bsquad of\s*(\d{1,2})\b/i);
  if (squad) return Number(squad[1]);
  return 1;
}

function readPreference(text: string) {
  if (/college|squad/i.test(text)) return "college_squad";
  if (/family/i.test(text)) return "family";
  if (/office|corporate/i.test(text)) return "office";
  if (/quiet/i.test(text)) return "quiet";
  return null;
}

function readDate(text: string, now: Date) {
  if (/christmas eve/i.test(text)) return nextMonthDay(now, 12, 24);
  if (/\btoday\b/i.test(text)) return iso(now);
  if (/\btomorrow\b/i.test(text)) {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return iso(next);
  }
  const isoMatch = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const named = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i);
  if (named) {
    const month = months.findIndex((item) => named[2].toLowerCase().startsWith(item));
    const year = named[3] ? Number(named[3]) : now.getFullYear();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }
  const reversed = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(20\d{2}))?\b/i);
  if (reversed) {
    const month = months.findIndex((item) => reversed[1].toLowerCase().startsWith(item));
    const year = reversed[3] ? Number(reversed[3]) : now.getFullYear();
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(reversed[2])).padStart(2, "0")}`;
  }
  return null;
}

function nextMonthDay(now: Date, month: number, day: number) {
  const year = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() > day)
    ? now.getFullYear() + 1
    : now.getFullYear();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function iso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
