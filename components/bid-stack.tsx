"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/format";

export type StackBid = {
  id: string;
  operator_name: string;
  verification_status: string;
  vehicle_label: string;
  capacity: number;
  registration: string | null;
  pickup_point: string | null;
  departure_time: string | null;
  fixed_quote: number;
  confirmed_seats: number;
  remaining_seats: number;
  fare_per_seat: number | null;
  transcript: string | null;
};

export function BidStack({
  bids,
  origin,
  destination,
  when,
  onHold,
  onFront,
}: {
  bids: StackBid[];
  origin: string;
  destination: string;
  when: string;
  onHold: (bid: StackBid) => void;
  onFront?: (bid: StackBid) => void;
}) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0);
  const [note, setNote] = useState("");
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const bid = bids[index] ?? bids[0];
  const behind = bids.length > 1 ? bids[(index + 1) % bids.length] : null;

  useEffect(() => {
    if (bid) onFront?.(bid);
  }, [bid?.id]);

  function pass() {
    if (bids.length < 2) {
      setNote("This is the only bid on the drop.");
      setDrag(0);
      return;
    }
    setNote("");
    setDrag(0);
    setIndex((value) => (value + 1) % bids.length);
  }

  function choose(item: StackBid) {
    setDrag(0);
    setNote("");
    onHold(item);
  }

  if (!bid) {
    return (
      <article className="rounded-[28px] border border-line bg-paper p-5 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.16em] text-slate">BIDS</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">Waiting for a bid</h2>
        <p className="mt-2 text-sm text-slate">
          {origin} → {destination}. Operators place a bid from their phone. Each bid lands here as a card, with the seat meter on it.
        </p>
      </article>
    );
  }

  const held = bid.confirmed_seats;
  const width = bid.capacity > 0 ? Math.min(100, Math.round((held / bid.capacity) * 100)) : 0;
  const goingRight = drag > 24;
  const goingLeft = drag < -24;

  return (
    <div className="space-y-3">
      <div className="relative min-h-[26rem]">
        {behind ? (
          <article className="absolute inset-x-3 top-3 h-[24rem] rounded-[28px] border border-line bg-canvas" />
        ) : null}
        <article
          className="relative rounded-[28px] border border-line bg-paper p-5 shadow-[0_16px_40px_rgba(18,20,23,0.08)]"
          onPointerCancel={() => {
            start.current = null;
            axis.current = null;
            setDrag(0);
          }}
          onPointerDown={(event) => {
            start.current = { x: event.clientX, y: event.clientY };
            axis.current = null;
          }}
          onPointerMove={(event) => {
            if (!start.current) return;
            const dx = event.clientX - start.current.x;
            const dy = event.clientY - start.current.y;
            if (!axis.current) {
              if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
              axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            }
            if (axis.current === "x") setDrag(dx);
          }}
          onPointerUp={() => {
            if (axis.current === "x" && drag > 96) choose(bid);
            else if (axis.current === "x" && drag < -96) pass();
            else setDrag(0);
            start.current = null;
            axis.current = null;
          }}
          style={{ transform: `translateX(${drag}px) rotate(${drag / 18}deg)` }}
        >
          {goingRight ? <Stamp label="Hold" tone="trust" /> : null}
          {goingLeft ? <Stamp label="Pass" tone="alert" /> : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-slate">BID {index + 1} / {bids.length}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold leading-tight">From {origin} to {destination}</h2>
              <p className="text-sm text-slate">{when}</p>
            </div>
            <Badge tone={bid.verification_status === "verified" ? "trust" : "neutral"}>{bid.verification_status}</Badge>
          </div>
          <div className="mt-5">
            <p className="text-xs font-semibold tracking-[0.14em] text-slate">SEAT METER</p>
            <p className="mt-1 font-display text-4xl font-semibold leading-none">
              {bid.fare_per_seat == null ? formatInr(bid.fixed_quote) : formatInr(bid.fare_per_seat)}
            </p>
            <p className="mt-1 text-sm text-slate">
              {bid.fare_per_seat == null
                ? "Vehicle quote. The per-person price appears after a seat is held."
                : `${formatInr(bid.fare_per_seat)} per person with ${held} seat${held === 1 ? "" : "s"} held.`}
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-sun" style={{ width: `${width}%` }} />
            </div>
            <p className="mt-2 text-sm">{held} held · {bid.remaining_seats} left · {bid.capacity} seats</p>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate">Operator</dt>
              <dd className="font-semibold">{bid.operator_name}</dd>
            </div>
            <div>
              <dt className="text-slate">Vehicle</dt>
              <dd className="font-semibold">{bid.vehicle_label}</dd>
            </div>
            <div>
              <dt className="text-slate">Pickup</dt>
              <dd className="font-semibold">{bid.pickup_point || "Not set"}{bid.departure_time ? ` · ${bid.departure_time}` : ""}</dd>
            </div>
            <div>
              <dt className="text-slate">Vehicle quote</dt>
              <dd className="font-semibold">{formatInr(bid.fixed_quote)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-slate">{bid.transcript ? `“${bid.transcript}”` : "No voice note on this bid."}</p>
          <p className="mt-2 text-xs text-slate">Swipe right to hold this bid. Swipe left for the next one.</p>
        </article>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={pass} type="button" variant="secondary">Pass</Button>
        <Button onClick={() => choose(bid)} type="button">Hold this bid</Button>
      </div>
      {note ? <p className="text-center text-sm text-slate">{note}</p> : null}
    </div>
  );
}

function Stamp({ label, tone }: { label: string; tone: "trust" | "alert" }) {
  return (
    <span className={`absolute right-4 top-16 rounded-xl border-2 px-2 py-1 text-sm font-semibold ${tone === "trust" ? "border-trust text-trust" : "border-alert text-alert"}`}>
      {label}
    </span>
  );
}
