let pending = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function beginBusy() {
  pending += 1;
  notify();
}

export function endBusy() {
  pending = Math.max(0, pending - 1);
  notify();
}

export function isBusy() {
  return pending > 0;
}

export function subscribeBusy(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
