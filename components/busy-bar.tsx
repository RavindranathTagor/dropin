"use client";

import { useEffect, useState } from "react";
import { isBusy, subscribeBusy } from "@/lib/busy";

export function BusyBar() {
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeBusy(() => setBusy(isBusy())), []);

  if (!busy) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-ink/25 pt-20" role="status" aria-live="assertive">
      <p className="rounded-full bg-ink px-5 py-3 text-base font-semibold text-white shadow-lg">Loading…</p>
    </div>
  );
}
