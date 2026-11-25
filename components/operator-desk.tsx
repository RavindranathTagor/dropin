"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppHeader, Phone } from "@/components/shell";
import { RouteRibbon } from "@/components/route-ribbon";
import { RouteMap } from "@/components/route-map";
import { VoiceRecorder } from "@/components/voice-recorder";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/input";
import { PICKUP_POINTS, VEHICLE_LABELS } from "@/lib/constants";
import { request } from "@/lib/browser";
import { formatInr, formatStatus, formatWhen } from "@/lib/format";

type Vehicle = { id: string; type: string; capacity: number; registration: string | null; verification_status: string };
type Room = { id: string; origin: string; destination: string; departure_date: string; departure_window: string; member_count: number; confirmed_seats: number; lowest_quote: number | null };
type Trip = { id: string; status: string; passenger_name: string; origin: string; destination: string; bid_id: string; room_id: string };

export function OperatorHome() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [message, setMessage] = useState("");

  async function load() {
    const { response, data } = await request("/api/operator", { busy: false });
    if (!response.ok) {
      setMessage("This desk is for an operator session.");
      return;
    }
    setVehicles((data.vehicles as Vehicle[]) || []);
    setRooms((data.rooms as Room[]) || []);
    setTrips((data.trips as Trip[]) || []);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function accept(bidId: string) {
    const { response, data } = await request(`/api/bids/${bidId}/accept`, { method: "POST" });
    setMessage(response.ok ? "Offer accepted." : String(data.error || "The offer was not accepted."));
    await load();
  }

  async function milestone(bookingId: string, eventType: "departed" | "completed") {
    const { response, data } = await request("/api/journey/events", {
      method: "POST",
      body: JSON.stringify({ booking_id: bookingId, event_type: eventType }),
    });
    setMessage(response.ok ? `Marked ${eventType}.` : String(data.error || "That milestone is not ready."));
    await load();
  }

  return (
    <Phone>
      <AppHeader subtitle="Operator desk" />
      <main className="space-y-4 px-4 py-5">
        {message ? <p className="rounded-2xl bg-sun-wash px-4 py-3 text-sm">{message}</p> : null}
        <section>
          <h1 className="font-display text-3xl font-semibold">Open corridors</h1>
          <div className="mt-3">
            <RouteMap destination={rooms[0]?.destination || "Mangaluru"} origin={rooms[0]?.origin || "Bengaluru"} />
          </div>
          <div className="mt-3 space-y-3">
            {rooms.map((room) => (
              <Link className="block rounded-3xl border border-line p-4" href={`/operator/rooms/${room.id}`} key={room.id}>
                <RouteRibbon destination={room.destination} meta={formatWhen(room.departure_date, room.departure_window)} origin={room.origin} />
                <p className="mt-3 text-sm text-slate">{room.member_count} in the group · {room.confirmed_seats} seats held · {room.lowest_quote ? `quotes from ${formatInr(room.lowest_quote)}` : "no quote yet"}</p>
                <p className="mt-3 inline-flex min-h-11 items-center rounded-full bg-sun px-4 text-sm font-semibold">Place a bid</p>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-display text-xl font-semibold">Your vehicles</h2>
          <ul className="mt-2 space-y-2">
            {vehicles.map((vehicle) => (
              <li className="rounded-2xl bg-canvas px-3 py-2 text-sm" key={vehicle.id}>
                {VEHICLE_LABELS[vehicle.type] || vehicle.type} · {vehicle.capacity} seats · {vehicle.registration} · {vehicle.verification_status}
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold">Held seats</h2>
          {trips.map((trip) => (
            <article className="rounded-3xl border border-line p-4" key={trip.id}>
              <p className="font-semibold">{trip.passenger_name}</p>
              <p className="text-sm text-slate">{trip.origin} to {trip.destination} · {formatStatus(trip.status)}</p>
              {["commitment_pending", "minimum_occupancy_reached", "operator_accepted"].includes(trip.status) ? (
                <Button className="mt-3" onClick={() => void accept(trip.bid_id)} type="button">Accept offer</Button>
              ) : null}
              {trip.status === "confirmed" ? <Button className="mt-3" onClick={() => void milestone(trip.id, "departed")} type="button" variant="secondary">Mark departed</Button> : null}
              {trip.status === "departed" ? <Button className="mt-3" onClick={() => void milestone(trip.id, "completed")} type="button" variant="secondary">Mark completed</Button> : null}
            </article>
          ))}
          {trips.length === 0 ? <p className="text-sm text-slate">No seats are held on your offers yet.</p> : null}
        </section>
      </main>
    </Phone>
  );
}

export function OperatorBid({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [voiceOn, setVoiceOn] = useState(true);
  const [pickupSuggestions, setPickupSuggestions] = useState(true);
  const [sentence, setSentence] = useState("12-seater TT ready at Kengeri Metro, 10 PM, ₹8500 fixed, toll included.");
  const [heard, setHeard] = useState("");
  const [english, setEnglish] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [quote, setQuote] = useState("");
  const [pickup, setPickup] = useState("");
  const [time, setTime] = useState("");
  const [toll, setToll] = useState(false);
  const [allowance, setAllowance] = useState(false);
  const [message, setMessage] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const lastKey = useRef("");
  const lastAmount = useRef("");

  useEffect(() => {
    void request("/api/flags", { busy: false }).then(({ data }) => {
      const flags = data.flags as { operator_voice_bid?: boolean; corridor_pickup?: boolean } | undefined;
      setVoiceOn(flags?.operator_voice_bid !== false);
      setPickupSuggestions(flags?.corridor_pickup !== false);
    });
    void request("/api/operator", { busy: false }).then(({ data }) => {
      const nextVehicles = (data.vehicles as Vehicle[]) || [];
      setVehicles(nextVehicles);
      setVehicleId((current) => {
        if (current && nextVehicles.some((item) => item.id === current)) return current;
        const preferred = nextVehicles.find((item) => item.type === "tempo_traveller") || nextVehicles.slice().sort((a, b) => b.capacity - a.capacity)[0];
        return preferred?.id || "";
      });
    });
    void request(`/api/drops/${roomId}`, { busy: false }).then(({ data }) => {
      if (data.room) setRoom(data.room as Room);
    });
    const timer = window.setInterval(() => {
      void request(`/api/drops/${roomId}`, { busy: false }).then(({ data }) => {
        if (data.room) setRoom(data.room as Room);
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [roomId]);

  useEffect(() => {
    if (!room || !vehicleId) return;
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle) return;
    const key = `${room.origin}|${room.destination}|${vehicleId}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    const tier = vehicle.capacity <= 7 ? "sedan" : vehicle.capacity <= 16 ? "tempo" : "bus";
    void request(`/api/quotes?origin=${encodeURIComponent(room.origin)}&destination=${encodeURIComponent(room.destination)}`, { busy: false }).then(({ data }) => {
      if (lastKey.current !== key) return;
      const match = (data.quotes as { id: string; vehicleTotal: number; km: number }[] | undefined)?.find((item) => item.id === tier);
      if (!match) return;
      const amount = String(match.vehicleTotal);
      setSuggestion(`${match.km} km suggests ${formatInr(match.vehicleTotal)} for this vehicle. Edit it if you want a different quote.`);
      setQuote((current) => (!current || current === lastAmount.current ? amount : current));
      lastAmount.current = amount;
    });
  }, [room, vehicleId, vehicles]);

  function apply(draft: Record<string, unknown>, transcript: string, translation: string) {
    setHeard(transcript);
    setEnglish(translation);
    if (draft.fixed_total_quote) setQuote(String(draft.fixed_total_quote));
    if (draft.pickup_point) setPickup(String(draft.pickup_point));
    if (draft.departure_time) setTime(String(draft.departure_time));
    setToll(Boolean(draft.toll_included));
    setAllowance(Boolean(draft.driver_allowance_included));
    const match = vehicles.find((vehicle) => vehicle.type === draft.vehicle_type && vehicle.capacity === draft.capacity);
    if (match) setVehicleId(match.id);
  }

  async function readSentence() {
    const { data } = await request("/api/bids/parse", { method: "POST", body: JSON.stringify({ text: sentence }) });
    if (data.draft) apply(data.draft as Record<string, unknown>, sentence, "");
  }

  async function submit() {
    const { response, data } = await request(`/api/drops/${roomId}/bids`, {
      method: "POST",
      body: JSON.stringify({
        vehicle_id: vehicleId,
        fixed_total_quote: Number(quote),
        pickup_point: pickup,
        departure_time: time,
        toll_included: toll,
        driver_allowance_included: allowance,
        transcript: heard || english || sentence,
      }),
    });
    setMessage(response.ok ? "Bid submitted. Passengers can compare it in the drop." : String(data.error || "The bid was not submitted."));
  }

  return (
    <Phone>
      <AppHeader subtitle="Voice bid" />
      <main className="space-y-4 px-4 py-5 pb-24">
        {room ? <RouteRibbon destination={room.destination} meta={formatWhen(room.departure_date, room.departure_window)} origin={room.origin} /> : <p>Loading the corridor…</p>}
        {room ? <RouteMap destination={room.destination} origin={room.origin} /> : null}
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Field label="Or type the offer">
              <TextInput onChange={(event) => setSentence(event.target.value)} value={sentence} />
            </Field>
          </div>
          {voiceOn ? (
            <VoiceRecorder
              onResult={(result) => {
                if (result.error) setMessage("Voice bidding did not return a transcript. Type the offer instead.");
                else apply(result.draft, result.transcript, result.translation);
              }}
              purpose="bid"
            />
          ) : null}
        </div>
        {!voiceOn ? <p className="text-sm text-slate">Voice bidding is off. Type the offer instead.</p> : null}
        <Button onClick={() => void readSentence()} type="button" variant="secondary">Read this offer</Button>
        {heard ? <p className="text-sm text-slate">Heard: {heard}</p> : null}
        {english ? <p className="text-sm text-slate">English: {english}</p> : null}
        <section className="space-y-3 rounded-3xl border border-line p-4">
          <h2 className="font-display text-xl font-semibold">Review the bid</h2>
          <Field label="Verified vehicle">
            <SelectInput onChange={(event) => setVehicleId(event.target.value)} value={vehicleId}>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {VEHICLE_LABELS[vehicle.type] || vehicle.type} · {vehicle.capacity} · {vehicle.registration}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Your quote, INR">
            <TextInput inputMode="numeric" onChange={(event) => setQuote(event.target.value)} value={quote} />
          </Field>
          {suggestion ? <p className="text-sm text-slate">{suggestion}</p> : null}
          <Field label="Pickup">
            <TextInput onChange={(event) => setPickup(event.target.value)} value={pickup} />
          </Field>
          {pickupSuggestions ? (
            <div className="flex flex-wrap gap-2">
              {PICKUP_POINTS.map((point) => (
                <button className="rounded-full bg-canvas px-3 py-2 text-sm" key={point} onClick={() => setPickup(point)} type="button">{point}</button>
              ))}
            </div>
          ) : null}
          <Field label="Departure time">
            <TextInput onChange={(event) => setTime(event.target.value)} placeholder="22:00" value={time} />
          </Field>
          <label className="flex gap-3 text-sm"><input checked={toll} onChange={(event) => setToll(event.target.checked)} type="checkbox" /> Toll included</label>
          <label className="flex gap-3 text-sm"><input checked={allowance} onChange={(event) => setAllowance(event.target.checked)} type="checkbox" /> Driver allowance included</label>
          <Button onClick={() => void submit()} size="lg" type="button">Submit bid</Button>
        </section>
        {message ? <p className="rounded-2xl bg-sun-wash px-4 py-3 text-sm">{message}</p> : null}
      </main>
    </Phone>
  );
}
