import { describe, expect, it } from "vitest";
import { canCommit, remainingSeats } from "@/lib/capacity";
import { parseBid } from "@/lib/parse-bid";
import { parseTrip } from "@/lib/parse-trip";
import { farePerPassenger } from "@/lib/pricing";
import { charterGuide, shareCopy } from "@/lib/distance";

const now = new Date("2026-11-25T02:00:00+05:30");

describe("fare", () => {
  it("divides an accepted quote by confirmed seats", () => {
    expect(farePerPassenger(8500, 12)).toBe(708.33);
    expect(farePerPassenger(16000, 20)).toBe(800);
    expect(farePerPassenger(24000, 24)).toBe(1000);
    expect(farePerPassenger(24000, 30)).toBe(800);
  });

  it("returns no fare when nobody has confirmed", () => {
    expect(farePerPassenger(8500, 0)).toBeNull();
  });
});

describe("distance guide", () => {
  it("prices Bengaluru to Mangaluru from published per-km cards", () => {
    const tempo = charterGuide("Bengaluru", "Mangaluru", "tempo");
    const sedan = charterGuide("Bengaluru", "Mangaluru", "sedan");
    expect(tempo).toMatchObject({ km: 352, billableKm: 352, vehicleTotal: 8948, perSeat: 745.67, toll: 250 });
    expect(sedan).toMatchObject({ vehicleTotal: 4926, perSeat: 1231.5 });
    const nearer = charterGuide("Bengaluru", "Mysuru", "tempo");
    expect(nearer?.km).toBe(145);
    expect(nearer!.vehicleTotal).toBeLessThan(tempo!.vehicleTotal);
  });

  it("writes a share line from the real quote and seat counts", () => {
    expect(
      shareCopy({
        origin: "Bengaluru",
        destination: "Mangaluru",
        when: "24 Dec 2026 · night",
        quote: 8500,
        held: 1,
        targetSeats: 12,
      }),
    ).toContain("708.33");
  });
});

describe("capacity", () => {
  it("refuses a seat the vehicle does not have", () => {
    expect(canCommit(12, 12, 1)).toBe(false);
    expect(canCommit(12, 11, 1)).toBe(true);
    expect(canCommit(12, 10, 3)).toBe(false);
    expect(remainingSeats(12, 5)).toBe(7);
  });
});

describe("trip parser", () => {
  it("reads the Christmas Eve Mangaluru example", () => {
    const draft = parseTrip("Christmas eve night Mangaluru hogbeku, budget 800, college squad.", { now });
    expect(draft).toMatchObject({
      origin: "Bengaluru",
      destination: "Mangaluru",
      travel_date: "2026-12-24",
      departure_period: "night",
      budget_per_person: 800,
      group_preference: "college_squad",
      passengers: 1,
      origin_assumed: true,
      needs_confirmation: true,
    });
  });

  it("keeps both cities when the passenger names them", () => {
    const draft = parseTrip("from Bengaluru to Mysuru tomorrow morning", { now });
    expect(draft.origin).toBe("Bengaluru");
    expect(draft.destination).toBe("Mysuru");
    expect(draft.travel_date).toBe("2026-11-26");
    expect(draft.departure_period).toBe("morning");
  });

  it("keeps from and to when the destination is named first", () => {
    const draft = parseTrip("to Hyderabad from Bengaluru tonight", { now });
    expect(draft.origin).toBe("Bengaluru");
    expect(draft.destination).toBe("Hyderabad");
    expect(draft.departure_period).toBe("night");
    expect(draft.origin_assumed).toBe(false);
  });
});

describe("bid parser", () => {
  it("reads the tempo traveller voice note", () => {
    const draft = parseBid("12-seater TT ready at Kengeri Metro, 10 PM, ₹8,500 fixed, toll included.");
    expect(draft).toMatchObject({
      vehicle_type: "tempo_traveller",
      capacity: 12,
      pickup_point: "Kengeri Metro",
      departure_time: "22:00",
      fixed_total_quote: 8500,
      toll_included: true,
      driver_allowance_included: false,
      needs_confirmation: true,
    });
  });
});
