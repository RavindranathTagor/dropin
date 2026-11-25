"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/shell";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/input";
import { CityField } from "@/components/city-field";
import { REALITY_CHECK } from "@/lib/reality";
import { CITIES, resolveCity } from "@/lib/cities";
import type { TierId } from "@/lib/distance";
import { request } from "@/lib/browser";
import { CrewmarkControl } from "@/components/crewmark-control";

type Quote = {
  id: TierId;
  label: string;
  seats: number;
  ratePerKm: number;
  allowance: number;
  km: number;
  vehicleTotal: number;
  perSeat: number;
  toll: number | null;
};

type QuoteResponse = {
  ok?: boolean;
  error?: string;
  km?: number;
  minutes?: number | null;
  source?: string;
  origin?: string;
  destination?: string;
  toll?: number | null;
  quotes?: Quote[];
};

type ListedRoom = {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  departure_window: string;
  member_count: number;
  confirmed_seats: number;
  target_occupancy: number | null;
  lowest_quote: number | null;
};

export type TripDraft = {
  origin: string;
  destination: string;
  travel_date: string;
  departure_period: string;
  passengers: string;
  group_preference: string;
  vehicle: TierId;
  offeredFare: number;
  crewmark: string;
};

const CITY_NAMES = new Set(CITIES.map((city) => city.canonical));

export function TripFlow({
  voiceOn,
  textFirst = false,
  sponsors = null,
  onOpen,
  saving,
  message,
}: {
  voiceOn: boolean;
  textFirst?: boolean;
  sponsors?: { sarvam: boolean; flagsmith: boolean; nudgebee: boolean } | null;
  onOpen: (trip: TripDraft) => void;
  saving: boolean;
  message: string;
}) {
  const [step, setStep] = useState<"where" | "ride">("where");
  const [origin, setOrigin] = useState("Bengaluru");
  const [destination, setDestination] = useState("Mangaluru");
  const [travelDate, setTravelDate] = useState("2026-12-24");
  const [windowName, setWindowName] = useState("night");
  const [tier, setTier] = useState<TierId>("tempo");
  const [fare, setFare] = useState("");
  const [fareDirty, setFareDirty] = useState(false);
  const [heard, setHeard] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const [route, setRoute] = useState<QuoteResponse | null>(null);
  const [active, setActive] = useState<ListedRoom | null>(null);
  const [pickups, setPickups] = useState<string[]>([]);
  const [crewmark, setCrewmark] = useState("open");
  const originText = useRef(origin);
  const destinationText = useRef(destination);

  function citiesNow() {
    const from = resolveCity(originText.current) || origin;
    const to = resolveCity(destinationText.current) || destination;
    return { from, to };
  }

  const chosen = route?.quotes?.find((item) => item.id === tier) || route?.quotes?.[1];

  useEffect(() => {
    if (!chosen || fareDirty) return;
    setFare(String(Math.round(chosen.perSeat)));
  }, [chosen, fareDirty]);

  useEffect(() => {
    if (textFirst) setPicking(true);
  }, [textFirst]);

  async function matchActive(pricedOrigin: string, pricedDestination: string, nextScope: string) {
    const listed = await request(
      `/api/drops?origin=${encodeURIComponent(pricedOrigin)}&destination=${encodeURIComponent(pricedDestination)}&date=${encodeURIComponent(travelDate)}&window=${encodeURIComponent(windowName)}&scope=${encodeURIComponent(nextScope)}`,
      { busy: false },
    );
    const rooms = ((listed.data.rooms as ListedRoom[]) || []).filter(
      (room) =>
        room.origin.toLowerCase() === pricedOrigin.toLowerCase() &&
        room.destination.toLowerCase() === pricedDestination.toLowerCase() &&
        String(room.departure_date).slice(0, 10) === travelDate &&
        room.departure_window === windowName,
    );
    const room = rooms[0] ?? null;
    setActive(room);
    setPickups([]);
    if (!room) return;
    const detail = await request(`/api/drops/${room.id}`, { busy: false });
    const bids = (detail.data.bids as { pickup_point?: string | null }[]) || [];
    const detailOrigin = String((detail.data.room as { origin?: string } | undefined)?.origin || "");
    const detailDestination = String((detail.data.room as { destination?: string } | undefined)?.destination || "");
    if (detailOrigin.toLowerCase() !== pricedOrigin.toLowerCase() || detailDestination.toLowerCase() !== pricedDestination.toLowerCase()) {
      setActive(null);
      return;
    }
    setPickups([...new Set(bids.map((bid) => bid.pickup_point).filter((point): point is string => Boolean(point)))]);
  }

  async function seeFares() {
    const { from, to } = citiesNow();
    if (!from || !to || from === to) {
      setLocalMessage("Choose two different cities.");
      setPicking(true);
      return;
    }
    setOrigin(from);
    setDestination(to);
    originText.current = from;
    destinationText.current = to;
    setPricing(true);
    setLocalMessage("");
    const { response, data } = await request(`/api/quotes?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}`);
    setPricing(false);
    if (!response.ok || !data.ok) {
      setLocalMessage("That road could not be priced. Try another city.");
      return;
    }
    const pricedOrigin = String(data.origin || from);
    const pricedDestination = String(data.destination || to);
    setOrigin(pricedOrigin);
    setDestination(pricedDestination);
    originText.current = pricedOrigin;
    destinationText.current = pricedDestination;
    setFareDirty(false);
    setRoute(data as QuoteResponse);
    setStep("ride");
    await matchActive(pricedOrigin, pricedDestination, crewmark);
  }

  function applyVoice(draft: Record<string, unknown>, transcript: string) {
    const nextOrigin = String(draft.origin || origin);
    const nextDestination = String(draft.destination || "");
    if (CITY_NAMES.has(nextOrigin)) {
      originText.current = nextOrigin;
      setOrigin(nextOrigin);
    }
    if (CITY_NAMES.has(nextDestination)) {
      destinationText.current = nextDestination;
      setDestination(nextDestination);
    }
    if (draft.travel_date) setTravelDate(String(draft.travel_date));
    if (draft.departure_period) setWindowName(String(draft.departure_period));
    setHeard(transcript);
    setPicking(!CITY_NAMES.has(nextDestination));
    setLocalMessage(nextDestination ? "" : "That recording did not name a city we can route. Pick it below.");
    if (CITY_NAMES.has(nextDestination)) {
      void request("/api/events", { method: "POST", body: JSON.stringify({ name: "search_started" }), busy: false });
    }
  }

  async function hearRoute() {
    const { from, to } = citiesNow();
    if (!from || !to || from === to) {
      setLocalMessage("Choose two different cities before playing the route.");
      return;
    }
    setSpeaking(true);
    const { response, data } = await request("/api/voice/speak", {
      method: "POST",
      body: JSON.stringify({ text: `From ${from} to ${to}.`, language: "en-IN" }),
    });
    setSpeaking(false);
    if (!response.ok || data.ok === false || typeof data.audio !== "string") {
      setLocalMessage("Sarvam could not read this route. The transcript is still on screen.");
      return;
    }
    const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
    await audio.play().catch(() => setLocalMessage("Playback was blocked. The transcript is still on screen."));
  }

  function openDrop() {
    if (!chosen || !(Number(fare) > 0)) return;
    onOpen({
      origin,
      destination,
      travel_date: travelDate,
      departure_period: windowName,
      passengers: "1",
      group_preference: "",
      vehicle: tier,
      offeredFare: Number(fare),
      crewmark,
    });
  }

  const sameCorridor = origin === REALITY_CHECK.origin && destination === REALITY_CHECK.destination;
  const busSample = REALITY_CHECK.rows.find((row) => row.mode === "Private bus");
  const held = active?.confirmed_seats ?? 0;
  const target = active?.target_occupancy ?? chosen?.seats ?? 0;
  const width = target > 0 ? Math.min(100, Math.round((held / target) * 100)) : 0;

  return (
    <div className="flex h-dvh max-h-dvh flex-col bg-paper">
      <AppHeader />
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {step === "where" ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-5 py-4">
              {voiceOn ? (
                <VoiceRecorder
                  onResult={(result) => {
                    if (result.error) {
                      setLocalMessage("Voice did not return a transcript. Pick the cities below.");
                      setPicking(true);
                    } else applyVoice(result.draft, result.transcript);
                  }}
                  prominent
                  purpose="trip"
                />
              ) : (
                <p className="text-center text-sm text-slate">Voice is off for this session. Pick the cities below.</p>
              )}
              {heard ? (
                <div className="w-full rounded-3xl bg-canvas px-4 py-3 text-center text-sm leading-relaxed">
                  <p>“{heard}”</p>
                  <p className="mt-1 text-xs font-semibold text-slate">Sarvam</p>
                  <button className="mt-2 min-h-11 text-sm font-semibold" onClick={() => void hearRoute()} type="button">
                    {speaking ? "Playing…" : "Hear this route"}
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap justify-center gap-2">
                <button className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-sm font-semibold" onClick={() => setPicking(true)} type="button">
                  From {origin || "city"}
                </button>
                <button className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-sm font-semibold" onClick={() => setPicking(true)} type="button">
                  <PinIcon />
                  To {destination || "city"}
                </button>
                <button className="min-h-11 rounded-full border border-line bg-paper px-4 text-sm font-semibold" onClick={() => setPicking(true)} type="button">
                  {chipDate(travelDate, windowName)}
                </button>
              </div>
              {picking || !voiceOn ? (
                <div className="w-full space-y-3 border-t border-line pt-4">
                  <h2 className="font-display text-lg font-semibold">From one city to another</h2>
                  <CityField
                    label="From"
                    onChange={(value) => {
                      originText.current = value;
                      setOrigin(value);
                    }}
                    onText={(value) => {
                      originText.current = value;
                    }}
                    value={origin}
                  />
                  <CityField
                    label="To"
                    onChange={(value) => {
                      destinationText.current = value;
                      setDestination(value);
                    }}
                    onText={(value) => {
                      destinationText.current = value;
                    }}
                    value={destination}
                  />
                  <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                    <Field label="Date">
                      <input className="min-h-12 w-full min-w-0 rounded-2xl border border-line bg-paper px-3 text-base" onChange={(event) => setTravelDate(event.target.value)} type="date" value={travelDate} />
                    </Field>
                    <Field label="Leaves">
                      <SelectInput onChange={(event) => setWindowName(event.target.value)} value={windowName}>
                        <option value="morning">Morning</option>
                        <option value="afternoon">Afternoon</option>
                        <option value="evening">Evening</option>
                        <option value="night">Night</option>
                      </SelectInput>
                    </Field>
                  </div>
                </div>
              ) : (
                <button className="min-h-11 text-sm font-semibold text-slate" onClick={() => setPicking(true)} type="button">
                  Or pick from and to
                </button>
              )}
              {sponsors ? (
                <p className="max-w-sm text-center text-[11px] leading-relaxed text-slate">
                  Sarvam listens and speaks the route. Flagsmith sets this phone to {textFirst ? "text first" : "voice first"}. Seat-hold problems are sent to NudgeBee.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h1 className="font-display text-2xl font-semibold">Feed of active routes</h1>
                <button className="min-h-11 shrink-0 text-sm font-semibold" onClick={() => setStep("where")} type="button">
                  Edit
                </button>
              </div>
              <p className="text-sm text-slate">
                {route?.km} km{route?.minutes ? ` · ${formatDrive(route.minutes)}` : ""} · {routeLabel(route?.source)}. The number is a suggestion from that distance.
              </p>
              {sameCorridor && busSample && chosen ? (
                <section className="rounded-3xl border border-line p-4">
                  <h2 className="text-sm font-semibold">Reality check</h2>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                    <div>
                      <p className="text-xs text-slate">Private bus sample</p>
                      <p className="font-display text-xl font-semibold text-alert">{formatRupee(busSample.fare)}</p>
                      <p className="text-[11px] leading-snug text-slate">Illustrative. Not a live listing.</p>
                    </div>
                    <p className="pt-4 text-xs font-semibold text-slate">vs</p>
                    <div className="text-right">
                      <p className="text-xs text-slate">Dropin suggestion</p>
                      <p className="font-display text-xl font-semibold text-trust">{formatRupee(chosen.perSeat)}</p>
                      <span className="mt-1 inline-block rounded-full bg-trust-wash px-2 py-0.5 text-[11px] font-semibold text-trust">Per person</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate">{REALITY_CHECK.note}</p>
                </section>
              ) : null}
              <CrewmarkControl
                onScope={(next) => {
                  setCrewmark(next);
                  void matchActive(origin, destination, next);
                }}
                scope={crewmark}
              />
              <section className="rounded-3xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Active</p>
                  <span className="rounded-full bg-trust-wash px-2 py-0.5 text-[11px] font-semibold text-trust">{active ? "Open" : "New"}</span>
                </div>
                <h2 className="mt-2 font-display text-xl font-semibold leading-tight">From {origin} to {destination}</h2>
                <p className="mt-1 text-sm text-slate">{chipDate(travelDate, windowName)}</p>
                {active ? (
                  <>
                    <p className="mt-3 text-sm font-semibold">
                      {held}/{target || "—"} seats held
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-sun" style={{ width: `${width}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-slate">No group on this road yet. Opening the drop starts one.</p>
                )}
                {pickups.length > 0 ? (
                  <p className="mt-3 text-sm">
                    {pickups.map((point, index) => (
                      <span key={point}>
                        {index > 0 ? <span className="text-slate"> or </span> : null}
                        <span className="font-semibold">{point}</span>
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate">Pickup is set by the operator on the drop.</p>
                )}
                {active ? (
                  <Link className="mt-3 block text-sm font-semibold underline" href={`/drops/${active.id}`}>
                    Open this drop
                  </Link>
                ) : null}
              </section>
              <div className="space-y-2">
                {(route?.quotes || []).map((quote) => {
                  const selected = quote.id === tier;
                  return (
                    <button
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${selected ? "border-ink bg-sun" : "border-line bg-paper"}`}
                      key={quote.id}
                      onClick={() => {
                        setTier(quote.id);
                        setFareDirty(false);
                      }}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{quote.label}</span>
                        <span className="block text-sm text-slate">{quote.seats} seats · {route?.km} km</span>
                      </span>
                      <span className="ml-auto shrink-0 text-right">
                        <span className="block font-display text-xl font-semibold leading-none">{formatRupee(quote.perSeat)}</span>
                        <span className="text-xs text-slate">suggestion</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <Field label="Your fare per person">
                <TextInput
                  inputMode="numeric"
                  onChange={(event) => {
                    setFareDirty(true);
                    setFare(event.target.value);
                  }}
                  value={fare}
                />
              </Field>
              <p className="text-sm text-slate">Suggested from the distance. Change it if you want a different price. The charged fare is still the operator quote divided by held seats.</p>
            </div>
          )}
          {localMessage || message ? <p className="mt-3 rounded-2xl bg-sun-wash px-3 py-2 text-sm">{localMessage || message}</p> : null}
        </div>
        <div className="border-t border-line bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {step === "where" ? (
            <Button disabled={pricing} onClick={() => void seeFares()} size="lg" type="button">
              {pricing ? "Loading…" : "See fares"}
            </Button>
          ) : (
            <Button disabled={saving || !chosen || !(Number(fare) > 0)} onClick={openDrop} size="lg" type="button">
              {saving ? "Loading…" : active ? "Join this drop" : "Open the drop"}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function routeLabel(source?: string) {
  if (source === "route") return "live driving distance";
  if (source === "published") return "published road card";
  return "estimated from the city positions";
}

function formatDrive(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function formatRupee(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Math.round(value));
}

function chipDate(iso: string, windowName: string) {
  const parsed = new Date(`${iso}T00:00:00`);
  const day = Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const period = windowName ? windowName.charAt(0).toUpperCase() + windowName.slice(1) : "";
  return `${day} ${period}`.trim();
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}
