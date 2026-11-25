export function remainingSeats(capacity: number, heldSeats: number) {
  return Math.max(0, capacity - heldSeats);
}

export function canCommit(capacity: number, heldSeats: number, requestedSeats: number) {
  return requestedSeats > 0 && heldSeats + requestedSeats <= capacity;
}
