export function Mark({
  className = "h-10 w-11",
  ink = "#FFC107",
  hole = "#FFFFFF",
  car = "#111111",
}: {
  className?: string;
  ink?: string;
  hole?: string;
  car?: string;
}) {
  return (
    <svg aria-hidden="true" className={`shrink-0 ${className}`} viewBox="0 0 68 64">
      <path
        d="M27 4c-9.2 0-16.6 7.2-16.6 16.2C10.4 32 27 56 27 56s16.6-24 16.6-35.8C43.6 11.2 36.2 4 27 4z"
        fill={ink}
      />
      <circle cx="27" cy="20" fill={hole} r="5.4" />
      <path d="M38 15.5h11.5L45 10l12.2 10.2L45 30.4l4.5-5.5H38z" fill={ink} />
      <path
        d="M18.5 40.5h13.2c.7 0 1.3.4 1.6 1l1.3 2.8h-19l1.3-2.8c.3-.6.9-1 1.6-1zm1.5 4.6a1.8 1.8 0 1 0 .02 0zm8.6 0a1.8 1.8 0 1 0 .02 0z"
        fill={car}
      />
    </svg>
  );
}

export function Wordmark({ detail }: { detail?: string }) {
  return (
    <span className="min-w-0">
      <p className="truncate font-display text-[1.65rem] font-extrabold lowercase leading-none tracking-[-0.05em]">
        <span className="text-ink">drop</span>
        <span className="text-sun">in</span>
      </p>
      <p className={`mt-0.5 truncate text-[10px] font-semibold tracking-[0.18em] text-ink ${detail ? "normal-case" : "uppercase"}`}>{detail || "Get home together"}</p>
    </span>
  );
}
