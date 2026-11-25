"use client";

import { useEffect, useMemo, useState } from "react";
import { charterGuide, shareCopy, TIERS, type TierId } from "@/lib/distance";
import { farePerPassenger } from "@/lib/pricing";
import { formatInr } from "@/lib/format";
import { request } from "@/lib/browser";
import { Mark } from "@/components/mark";

export type MeterBid = {
  id: string;
  operator: string;
  vehicle: string;
  quote: number;
  capacity: number;
  held: number;
  tollIncluded: boolean;
};

function matchBid(bids: MeterBid[], tierId: TierId) {
  const matches = bids.filter((bid) => {
    if (tierId === "sedan") return bid.capacity <= 7;
    if (tierId === "tempo") return bid.capacity >= 8 && bid.capacity <= 16;
    return bid.capacity >= 17;
  });
  return matches.sort((a, b) => b.held - a.held || a.quote - b.quote)[0] ?? null;
}

export function PriceMeter({
  origin,
  destination,
  when,
  bids = [],
  shareUrl,
}: {
  origin: string;
  destination: string;
  when: string;
  bids?: MeterBid[];
  shareUrl?: string;
}) {
  const [tierId, setTierId] = useState<TierId>("tempo");
  const [copied, setCopied] = useState("");
  const [live, setLive] = useState<{ km: number; source: string; quotes: LiveQuote[] } | null>(null);
  const [road, setRoad] = useState<"loading" | "live" | "local">("loading");
  useEffect(() => {
    let ignore = false;
    setRoad("loading");
    setLive(null);
    void request(`/api/quotes?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`, { busy: false }).then(({ response, data }) => {
      if (ignore) return;
      const quotes = (data.quotes as LiveQuote[]) || [];
      if (response.ok && data.ok && quotes.length) {
        setLive({ km: Number(data.km), source: String(data.source || ""), quotes });
        setRoad("live");
      } else setRoad("local");
    });
    return () => {
      ignore = true;
    };
  }, [origin, destination]);
  const guide = useMemo(() => {
    const local = charterGuide(origin, destination, tierId);
    if (road !== "live" || !live) return road === "local" ? local : null;
    const match = live.quotes.find((item) => item.id === tierId);
    if (!local || !match) return local;
    const distanceSource = live.source === "route" ? "route" : live.source === "published" ? "published" : "estimated";
    return { ...local, ...match, km: live.km, billableKm: match.billableKm || match.km, distanceSource };
  }, [origin, destination, tierId, live, road]);
  const bid = matchBid(bids, tierId);
  const quote = bid?.quote ?? guide?.vehicleTotal ?? null;
  const held = bid?.held ?? 0;
  const target = bid ? Math.min(guide?.seats ?? 1, bid.capacity) : guide?.seats ?? 1;
  const currentFare = quote !== null && held > 0 ? farePerPassenger(quote, held) : null;
  const previewFare = quote !== null ? farePerPassenger(quote, target) : null;
  const tollEach = guide?.toll && target > 0 && !bid?.tollIncluded ? Math.round((guide.toll / target) * 100) / 100 : 0;
  const card = quote !== null ? shareCopy({ origin, destination, when, quote, held, targetSeats: target, guide: !bid }) : "";
  const fill = bid ? Math.min(100, Math.round((bid.held / bid.capacity) * 100)) : 0;

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied("Copy failed. Select the card text instead.");
    }
  }

  async function shareCard() {
    const payload = shareUrl ? `${card}\n${shareUrl}` : card;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Dropin", text: card, url: shareUrl });
        setCopied("Share sheet opened.");
        return;
      } catch {
        /* fall through to copy */
      }
    }
    await copyText("Card copied.", payload);
  }

  return (
    <section className="space-y-4 rounded-3xl border border-line p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Price meter</p>
          <p key={`${tierId}-${currentFare ?? "empty"}`} className="fare-pop font-display text-4xl font-semibold leading-none">
            {currentFare === null ? "—" : formatInr(currentFare)}
          </p>
          <p className="mt-1 text-sm text-slate">{currentFare === null ? "No seats held on this vehicle yet." : "Current split for seats already held."}</p>
        </div>
        <p className="text-right text-sm">
          <span className="block font-semibold">{held} held</span>
          <span className="text-slate">{bid ? `${bid.capacity} seats` : `${target} in this guide`}</span>
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full bg-sun transition-[width] duration-500" style={{ width: `${fill}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TIERS.map((tier) => (
          <button
            className={`rounded-2xl border px-2 py-3 text-left transition active:scale-[0.98] ${tier.id === tierId ? "border-ink bg-sun" : "border-line bg-paper hover:bg-canvas"}`}
            key={tier.id}
            onClick={() => setTierId(tier.id)}
            type="button"
          >
            <span className="block font-display text-lg font-semibold">{tier.seats}</span>
            <span className="block text-xs">{tier.label}</span>
          </button>
        ))}
      </div>
      {road === "loading" ? <p className="text-sm text-slate">Checking the driving distance.</p> : null}
      {guide ? (
        <div className="space-y-1 text-sm">
          <p>
            {guide.km} km {distanceWords(guide.distanceSource)}. {guide.billableKm} km billed at {formatInr(guide.ratePerKm)}
            /km + {formatInr(guide.allowance)} driver allowance.
          </p>
          <p>
            Distance guide for a full {guide.label.toLowerCase()}: {formatInr(guide.vehicleTotal)}, or {formatInr(guide.perSeat)} a seat if all {guide.seats} seats are filled.
          </p>
          {bid ? (
            <p>
              {bid.operator}&apos;s {bid.vehicle} quote is {formatInr(bid.quote)}. At {target} seats that quote is {formatInr(previewFare)} a seat.
              {bid.held > 0 ? ` With ${bid.held} held, it is ${formatInr(currentFare)} today.` : " Nobody has held a seat on it yet."}
            </p>
          ) : (
            <p>No operator has bid a {guide.label.toLowerCase()} on this drop. The number above is a planning guide, not a booking price.</p>
          )}
          <p className="text-slate">A larger group does not upgrade the vehicle by itself. You hold a seat on one bid, and that bid cannot take more people than its vehicle.</p>
        </div>
      ) : (
        <p className="text-sm text-slate">Add two known cities to see a distance guide.</p>
      )}
      <details className="text-sm text-slate">
        <summary className="cursor-pointer font-semibold text-ink">How the guide is priced</summary>
        <p className="mt-2">
          Outstation cabs charge the whole vehicle: road kilometres times a per-km card rate, plus a driver allowance. The kilometres follow the cities on the route. Sedan ₹13/km and ₹350 allowance, tempo ₹24/km and ₹500, mini bus ₹28/km and ₹500. Tolls are extra unless the operator includes them. The fare a passenger can be charged is still an operator quote divided by seats held.
        </p>
      </details>
      {card ? (
        <article className="share-card space-y-3 rounded-3xl bg-ink p-4 text-paper">
          <div className="flex items-center gap-2">
            <Mark car="#111111" className="h-8 w-8" hole="#FFFFFF" ink="#FFC107" />
            <p className="font-display text-lg font-semibold">Dropin</p>
          </div>
          <p className="font-display text-2xl font-semibold leading-tight">
            {origin} → {destination}
          </p>
          <p className="text-sm text-white/70">{when}</p>
          <p className="text-sm leading-relaxed">{card}</p>
          {tollEach > 0 ? <p className="text-sm text-white/70">Toll is extra. About {formatInr(tollEach)} a seat on the published sample, split {target} ways.</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-2xl bg-sun px-3 py-3 text-sm font-semibold text-ink" onClick={() => void shareCard()} type="button">
              Share card
            </button>
            <button className="rounded-2xl bg-white/10 px-3 py-3 text-sm font-semibold" onClick={() => void copyText("Card copied.", shareUrl ? `${card}\n${shareUrl}` : card)} type="button">
              Copy text
            </button>
          </div>
        </article>
      ) : null}
      <div className="rounded-2xl bg-canvas p-3 text-sm">
        <p className="font-semibold">UPI split</p>
        <p className="mt-1">
          {currentFare === null
            ? "There is no per-person amount until someone holds a seat."
            : `Each held seat is ${formatInr(currentFare)}${tollEach > 0 ? `, plus about ${formatInr(tollEach)} toll if it is not in the quote` : ""}.`}
        </p>
        <p className="mt-1 text-slate">Dropin does not collect this and does not hold a refundable deposit. The seat hold is the commitment. Pay the operator in your own UPI app.</p>
        {currentFare !== null ? (
          <button
            className="mt-3 w-full rounded-2xl border border-line bg-paper px-3 py-3 text-sm font-semibold"
            onClick={() =>
              void copyText(
                "Split copied.",
                `Dropin ${origin} to ${destination}. Seat split ${formatInr(currentFare)}${tollEach > 0 ? ` plus toll share ${formatInr(tollEach)}` : ""}. Pay the operator directly.`,
              )
            }
            type="button"
          >
            Copy the split
          </button>
        ) : null}
      </div>
      {copied ? <p className="text-sm">{copied}</p> : null}
    </section>
  );
}

type LiveQuote = {
  id: TierId;
  label: string;
  seats: number;
  ratePerKm: number;
  allowance: number;
  km: number;
  billableKm: number;
  vehicleTotal: number;
  perSeat: number | null;
  toll: number | null;
};

function distanceWords(source?: string) {
  if (source === "route") return "live driving distance";
  if (source === "published") return "published road card";
  return "estimated road distance";
}
