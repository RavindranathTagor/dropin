import { cn } from "@/lib/utils";

export function Badge({ className, tone = "neutral", children }: { className?: string; tone?: "neutral" | "sun" | "trust" | "alert"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-canvas text-slate",
    sun: "bg-sun-wash text-ink",
    trust: "bg-trust-wash text-trust",
    alert: "bg-alert-wash text-alert",
  };
  return <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold capitalize", tones[tone], className)}>{children}</span>;
}
