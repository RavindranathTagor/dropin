export function RouteRibbon({ origin, destination, meta }: { origin: string; destination: string; meta?: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">From</p>
          <p className="truncate font-display text-2xl font-semibold">{origin}</p>
        </div>
        <svg aria-hidden="true" className="h-4 flex-1" preserveAspectRatio="none" viewBox="0 0 120 16">
          <path className="route-dash" d="M0 8h120" fill="none" stroke="#E6AC00" strokeDasharray="6 6" strokeWidth="3" />
        </svg>
        <div className="min-w-0 text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">To</p>
          <p className="truncate font-display text-2xl font-semibold">{destination}</p>
        </div>
      </div>
      {meta ? <p className="mt-2 text-sm text-slate">{meta}</p> : null}
    </div>
  );
}
