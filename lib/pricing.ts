export function farePerPassenger(quote: number, confirmedSeats: number) {
  if (!Number.isFinite(quote) || quote < 0) {
    throw new Error("invalid_quote");
  }
  if (!Number.isInteger(confirmedSeats) || confirmedSeats < 0) {
    throw new Error("invalid_count");
  }
  if (confirmedSeats === 0) return null;
  return Math.round((quote / confirmedSeats) * 100) / 100;
}

export function fullVehicleProjection(quote: number, capacity: number) {
  return farePerPassenger(quote, capacity);
}
