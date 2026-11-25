"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader, Phone } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/input";
import { LANGUAGES } from "@/lib/constants";
import { request } from "@/lib/browser";
import { formatInr, formatStatus, formatWhen } from "@/lib/format";
import { REALITY_CHECK } from "@/lib/reality";
import { RouteMap } from "@/components/route-map";
import { BidStack } from "@/components/bid-stack";
import { CrewmarkControl } from "@/components/crewmark-control";
import { PriceMeter } from "@/components/price-meter";

type Bid = {
  id: string;
  operator_name: string;
  demo_label: string | null;
  verification_status: string;
  vehicle_label: string;
  capacity: number;
  registration: string | null;
  pickup_point: string | null;
  departure_time: string | null;
  toll_included: boolean;
  driver_allowance_included: boolean;
  fixed_quote: number;
  confirmed_seats: number;
  remaining_seats: number;
  fare_per_seat: number | null;
  full_vehicle_fare: number | null;
  price_final: boolean;
  status: string;
  transcript: string | null;
};

type DropPayload = {
  room: {
    id: string;
    origin: string;
    destination: string;
    departure_date: string;
    departure_window: string;
    target_occupancy: number | null;
    confirmed_seats: number;
    member_count: number;
    share_code: string;
    drill: boolean;
    crewmark_scope?: string | null;
    crewmark_org?: string | null;
  };
  members: { id: string; name: string; seats: number; commitment_status: string; affiliation_status: string | null; offered_fare: number | null }[];
  bids: Bid[];
  my_booking: { id: string; status: string; bid_id: string | null; seats: number } | null;
};

export function DropRoom({ roomKey }: { roomKey: string }) {
  const [drop, setDrop] = useState<DropPayload | null>(null);
  const [flags, setFlags] = useState<Record<string, unknown> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Bid | null>(null);
  const [message, setMessage] = useState("");
  const [familyLink, setFamilyLink] = useState("");
  const [contactName, setContactName] = useState("");
  const [language, setLanguage] = useState("kn-IN");
  const [consented, setConsented] = useState(false);
  const [shareOrigin, setShareOrigin] = useState("");
  const [joinFare, setJoinFare] = useState("");
  const [panel, setPanel] = useState<"drop" | "road">("drop");
  const [ammaOn, setAmmaOn] = useState(false);
  const [focusId, setFocusId] = useState("");

  async function load() {
    const { data } = await request(`/api/drops/${roomKey}`, { busy: false });
    if (data.room) {
      const next = data as unknown as DropPayload;
      setDrop(next);
      setFocusId((current) => current || next.my_booking?.bid_id || next.bids[0]?.id || "");
    } else setMessage(String(data.error || "This drop is not available."));
  }

  useEffect(() => {
    void request("/api/auth/me", { busy: false }).then(({ data }) => setRole((data.user as { role?: string } | null)?.role || null));
    void request("/api/flags", { busy: false }).then(({ data }) => setFlags((data.flags as Record<string, unknown>) || null));
    void load();
    setShareOrigin(window.location.origin);
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [roomKey]);

  async function leave() {
    const { response, data } = await request(`/api/drops/${drop?.room.id}/leave`, { method: "POST" });
    setMessage(response.ok ? "You left the drop." : String(data.error || "Could not leave."));
    await load();
  }

  async function join() {
    const { response, data } = await request(`/api/drops/${drop?.room.id}/join`, {
      method: "POST",
      body: JSON.stringify({ seats: 1, offered_fare: Number(joinFare) || null }),
    });
    if (!response.ok) setMessage(String(data.error || "Could not join."));
    await load();
  }

  async function hold(bid: Bid) {
    if (!drop) return;
    const keyName = `commit:${drop.room.id}:${bid.id}`;
    const existing = window.sessionStorage.getItem(keyName);
    const idempotency = existing || crypto.randomUUID();
    window.sessionStorage.setItem(keyName, idempotency);
    await request(`/api/bids/${bid.id}/select`, { method: "POST" });
    const { response, data } = await request("/api/bookings/commit", {
      method: "POST",
      body: JSON.stringify({ room_id: drop.room.id, bid_id: bid.id, seats: drop.my_booking?.seats || 1, idempotency_key: idempotency }),
    });
    if (!response.ok) setMessage(explain(String(data.error || "seat_not_held")));
    else setMessage(`Seat held. Status: ${formatStatus(String(data.status || "commitment pending"))}.`);
    setChosen(null);
    await load();
  }

  async function saveFamily() {
    if (!consented) {
      setMessage("Consent is required before family updates.");
      return;
    }
    const { response, data } = await request("/api/family", {
      method: "POST",
      body: JSON.stringify({ contact_name: contactName, language }),
    });
    if (!response.ok) {
      setMessage(String(data.error || "Family updates were not saved."));
      return;
    }
    const link = `${window.location.origin}${data.path}`;
    setFamilyLink(link);
    if (navigator.clipboard) await navigator.clipboard.writeText(link).catch(() => undefined);
    setMessage("Family link is ready. It shares a milestone, not a live location.");
  }

  if (!drop) {
    return (
      <Phone>
        <AppHeader />
        <main className="p-4">{message || "Loading the drop…"}</main>
      </Phone>
    );
  }

  const share = shareOrigin ? `${shareOrigin}/drops/${drop.room.share_code}` : `/drops/${drop.room.share_code}`;
  const holding = drop.my_booking && !["interested", "offer_received"].includes(drop.my_booking.status);
  const ratio = Number((flags?.pool_config as { minimum_confirmation_ratio?: number } | undefined)?.minimum_confirmation_ratio ?? 0.75);
  const focus = drop.bids.find((bid) => bid.id === focusId) || drop.bids[0] || null;
  const onRoad = Boolean(drop.my_booking && ["departed", "completed"].includes(drop.my_booking.status));
  const stops = [...new Set(drop.bids.map((bid) => bid.pickup_point).filter((point): point is string => Boolean(point)))];
  const routeLine = stops.length ? `${drop.room.origin} → ${stops.join(" → ")} → ${drop.room.destination}` : `${drop.room.origin} → ${drop.room.destination}`;
  const seatPrice = focus?.fare_per_seat == null ? "" : ` · ${formatInr(focus.fare_per_seat)}`;

  async function shareProgress() {
    if (!drop?.my_booking) {
      setMessage("Join the drop before sharing a family update.");
      setPanel("drop");
      return;
    }
    if (!consented || !contactName.trim()) {
      setAmmaOn(true);
      setPanel("road");
      setMessage("Add the family contact and consent, then share.");
      return;
    }
    await saveFamily();
  }

  const ammaCard = flags?.amma_mode === false || role !== "passenger" || !drop.my_booking ? null : (
    <section className="rounded-3xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Amma Mode</h2>
          <p className="text-sm text-slate">Parents get a milestone, not a live location.</p>
        </div>
        <button
          aria-checked={ammaOn}
          className={`relative h-8 w-14 shrink-0 rounded-full ${ammaOn ? "bg-sun" : "bg-line"}`}
          onClick={() => setAmmaOn((value) => !value)}
          role="switch"
          type="button"
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-paper shadow ${ammaOn ? "left-7" : "left-1"}`} />
        </button>
      </div>
      {ammaOn ? (
        <div className="mt-3 space-y-3">
          <Field label="Contact name">
            <TextInput onChange={(event) => setContactName(event.target.value)} value={contactName} />
          </Field>
          <Field label="Language">
            <SelectInput onChange={(event) => setLanguage(event.target.value)} value={language}>
              {LANGUAGES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </SelectInput>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input checked={consented} className="mt-1 h-5 w-5" onChange={(event) => setConsented(event.target.checked)} type="checkbox" />
            <span>I consent to factual milestone messages for this contact.</span>
          </label>
          {familyLink ? <p className="break-all text-sm">Family link: {familyLink}</p> : null}
        </div>
      ) : null}
    </section>
  );

  return (
    <Phone>
      <div className="flex h-dvh max-h-dvh flex-col">
      <AppHeader subtitle={panel === "road" ? "Road" : `#${drop.room.share_code}`} title={`From ${drop.room.origin} to ${drop.room.destination}`} />
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {panel === "road" ? (
          <>
            <div className="relative h-[46dvh] min-h-64 overflow-hidden rounded-3xl border border-line">
              <RouteMap bare destination={drop.room.destination} origin={drop.room.origin} />
            </div>
            <section className="relative z-10 -mt-10 space-y-3 rounded-3xl border border-line bg-paper p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold">Checkpoint</h2>
                <Badge tone={onRoad ? "trust" : "neutral"}>{onRoad ? "Active" : "Waiting"}</Badge>
              </div>
              <p className="text-sm font-semibold">{routeLine}</p>
              <p className="text-sm text-slate">
                {onRoad
                  ? `This group is ${formatStatus(drop.my_booking?.status || "departed")}. Amma Mode can share that milestone.`
                  : "No checkpoint yet. A milestone appears after the operator marks the group departed. This is not a live GPS trail."}
              </p>
              {ammaCard}
            </section>
          </>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {drop.members.map((member, index) => (
                <div className="w-16 shrink-0 text-center" key={member.id}>
                  <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-sm font-semibold ${AVATAR[index % AVATAR.length]}`}>{initials(member.name)}</span>
                  <span className="mt-1 block truncate text-[11px] text-slate">{member.name.split(" ")[0]}</span>
                </div>
              ))}
              {drop.members.length === 0 ? <p className="text-sm text-slate">No one has joined yet.</p> : null}
            </div>
            <p className="text-sm text-slate">{formatWhen(drop.room.departure_date, drop.room.departure_window)} · {drop.room.confirmed_seats} seats held · target {drop.room.target_occupancy ?? "—"}</p>
            <p className="text-sm font-semibold">{crewmarkLabel(drop.room.crewmark_scope, drop.room.crewmark_org)}</p>
            {drop.room.crewmark_scope && drop.room.crewmark_scope !== "open" ? (
              <CrewmarkControl locked onScope={() => undefined} scope={drop.room.crewmark_scope} />
            ) : null}
            <BidStack
              bids={drop.bids}
              destination={drop.room.destination}
              onFront={(bid) => setFocusId(bid.id)}
              onHold={(bid) => {
                setFocusId(bid.id);
                const full = drop.bids.find((item) => item.id === bid.id) || null;
                if (role === "passenger" && drop.my_booking && !holding && full) setChosen(full);
                else if (role === "passenger" && drop.my_booking) setMessage(`This seat is already ${formatStatus(drop.my_booking.status)}.`);
                else setMessage("Join the drop before holding a seat.");
              }}
              origin={drop.room.origin}
              when={formatWhen(drop.room.departure_date, drop.room.departure_window)}
            />
            {ammaCard}
            {!drop.my_booking && role === "passenger" ? (
              <Field label="Your fare per person">
                <TextInput inputMode="numeric" onChange={(event) => setJoinFare(event.target.value)} placeholder="Suggested price, or your own" value={joinFare} />
              </Field>
            ) : null}
          </>
        )}
        {panel === "drop" ? (
          <>
        <details className="rounded-3xl border border-line p-4">
          <summary className="cursor-pointer font-semibold">Price details</summary>
          <div className="mt-3">
        <PriceMeter
          bids={drop.bids.map((bid) => ({
            id: bid.id,
            operator: bid.operator_name,
            vehicle: bid.vehicle_label,
            quote: bid.fixed_quote,
            capacity: bid.capacity,
            held: bid.confirmed_seats,
            tollIncluded: bid.toll_included,
          }))}
          destination={drop.room.destination}
          origin={drop.room.origin}
          shareUrl={share}
          when={formatWhen(drop.room.departure_date, drop.room.departure_window)}
        />
          </div>
        </details>
        <section className="rounded-3xl bg-canvas p-4">
          <p className="text-sm font-semibold">Share this drop</p>
          <p className="mt-1 break-all text-sm">{share}</p>
        </section>
        {drop.my_booking ? <Badge tone={drop.my_booking.status === "confirmed" ? "trust" : "sun"}>{formatStatus(drop.my_booking.status)}</Badge> : null}
        {drop.my_booking && !["departed", "completed"].includes(drop.my_booking.status) ? (
          <Button onClick={() => void leave()} type="button" variant="secondary">Leave this drop</Button>
        ) : null}
        {flags?.reality_check !== false && drop.room.origin === REALITY_CHECK.origin && drop.room.destination === REALITY_CHECK.destination ? (
          <section className="space-y-2 rounded-3xl border border-line p-4">
            <h2 className="font-display text-xl font-semibold">Reality check</h2>
            <p className="text-sm text-slate">Sample fares as of {new Date(REALITY_CHECK.asOf).toLocaleString("en-IN")}.</p>
            {REALITY_CHECK.rows.map((row) => (
              <p key={row.mode}>{row.mode}: {formatInr(row.fare)}. {row.source}</p>
            ))}
            <p className="text-sm">{REALITY_CHECK.note}</p>
          </section>
        ) : null}
        <p className="text-sm text-slate">Confirmation threshold for this session: {Math.round(ratio * 100)}% of the chosen vehicle. A full room is not a confirmed booking.</p>
        <Link className="text-sm font-semibold underline" href="/drops">All drops</Link>
          </>
        ) : null}
        {message ? <p className="rounded-2xl bg-sun-wash px-4 py-3 text-sm">{message}</p> : null}
      </main>
      <div className="border-t border-line bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button className="mb-2 min-h-11 w-full text-sm font-semibold text-slate" onClick={() => setPanel(panel === "road" ? "drop" : "road")} type="button">
          {panel === "road" ? "Back to the bids" : "Road map"}
        </button>
        {panel === "road" ? (
          <Button onClick={() => void shareProgress()} size="lg" type="button">Share progress</Button>
        ) : !drop.my_booking && role === "passenger" ? (
          <Button onClick={() => void join()} size="lg" type="button">Join this drop</Button>
        ) : role === "passenger" && drop.my_booking && !holding && focus ? (
          <Button onClick={() => setChosen(focus)} size="lg" type="button">Hold a seat{seatPrice}</Button>
        ) : (
          <p className="py-3 text-center text-sm font-semibold">{drop.my_booking ? formatStatus(drop.my_booking.status) : "Offers appear here when an operator bids."}</p>
        )}
      </div>
      {chosen ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40" role="dialog">
          <div className="w-full max-w-[440px] rounded-t-3xl bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h2 className="font-display text-2xl font-semibold">Hold a seat</h2>
            <p className="mt-2">{chosen.vehicle_label}, {chosen.capacity} seats. Pickup {chosen.pickup_point} at {chosen.departure_time}.</p>
            <p className="mt-2">Quote {formatInr(chosen.fixed_quote)}. {chosen.remaining_seats} seats left.</p>
            <p className="mt-2 text-sm text-slate">This holds a seat. It does not collect payment or issue a ticket. The trip is confirmed only after the occupancy threshold and operator acceptance.</p>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => void hold(chosen)} size="lg" type="button">Hold your seat</Button>
              <Button onClick={() => setChosen(null)} type="button" variant="secondary">Back</Button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </Phone>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "•";
}

const AVATAR = ["bg-sun text-ink", "bg-sun-wash text-ink", "bg-canvas text-ink", "bg-trust-wash text-trust"];

function explain(error: string) {
  if (error === "capacity_exceeded") return "That vehicle has no seats left.";
  if (error === "booking_writes_paused") return "Booking is paused. No new seats can be held.";
  if (error === "already_committed") return "You already hold a seat on this drop.";
  if (error.includes(" ")) return error;
  return error.replaceAll("_", " ");
}

function crewmarkLabel(scope?: string | null, org?: string | null) {
  if (!scope || scope === "open") return "Crewmark · open to anyone";
  if (scope === "campus") return `Crewmark · ${org || "campus"} only`;
  if (scope === "tech_park") return `Crewmark · ${org || "company"} only`;
  if (scope === "verified_peer") return "Crewmark · Verified Peers";
  if (scope === "tier3") return "Crewmark · Tier 3 ID layer. DigiLocker, Aadhaar, a driving licence, and LinkedIn are not checked here.";
  return "Crewmark";
}
