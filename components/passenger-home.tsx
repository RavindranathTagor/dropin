"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, Phone, SessionPicker } from "@/components/shell";
import { TripFlow, type TripDraft } from "@/components/trip-flow";
import { request } from "@/lib/browser";

type Flags = {
  voice_trip_search: boolean;
  vibe_filters: boolean;
  christmas_drop_mode: boolean;
  voice_launch_experiment: "voice_first" | "text_first";
  source: string;
};

type Sponsors = {
  sarvam: boolean;
  flagsmith: boolean;
  nudgebee: boolean;
};

export function PassengerHome() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null | undefined>(undefined);
  const [flags, setFlags] = useState<Flags | null>(null);
  const [sponsors, setSponsors] = useState<Sponsors | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void request("/api/auth/me", { busy: false }).then(({ data }) => setUser((data.user as { name: string; role: string } | null) ?? null));
  }, []);

  useEffect(() => {
    if (!user) return;
    void request("/api/flags", { busy: false }).then(({ data }) => {
      setFlags((data.flags as Flags) || null);
      setSponsors((data.sponsors as Sponsors) || null);
    });
  }, [user]);

  async function confirm(trip: TripDraft) {
    if (!trip.origin || !trip.destination || !trip.travel_date) {
      setMessage("Origin, destination, and date are required before a drop opens.");
      return;
    }
    setSaving(true);
    void request("/api/events", { method: "POST", body: JSON.stringify({ name: "search_completed" }) });
    const { response, data } = await request("/api/drops", {
      method: "POST",
      body: JSON.stringify({
        origin: trip.origin,
        destination: trip.destination,
        travel_date: trip.travel_date,
        departure_window: trip.departure_period,
        seats: 1,
        vibe: trip.group_preference || null,
        offered_fare: trip.offeredFare,
        crewmark: trip.crewmark || "open",
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(String(data.error || "The drop could not be opened."));
      return;
    }
    router.push(`/drops/${data.roomId}`);
  }

  const voiceOn = flags?.voice_trip_search !== false;

  if (user?.role === "passenger") {
    return (
      <Phone>
        <TripFlow
          message={message}
          onOpen={(trip) => void confirm(trip)}
          saving={saving}
          sponsors={sponsors}
          textFirst={flags?.voice_launch_experiment === "text_first"}
          voiceOn={voiceOn}
        />
      </Phone>
    );
  }

  return (
    <Phone>
      <AppHeader />
      <main className="space-y-5 px-4 py-5 pb-16">
        {user === undefined ? <p className="text-slate">Loading…</p> : null}
        {user === null ? (
          <section className="space-y-4">
            <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-3xl">Drop in with the group.</h1>
            <p className="text-base text-slate">One vehicle. The fare splits as people hold seats. Pick who you are, then say where you are going.</p>
            <SessionPicker />
          </section>
        ) : null}
        {user && user.role !== "passenger" ? (
          <p className="rounded-2xl bg-canvas p-4 text-sm">You are signed in as {user.name}. Open the operator desk or switch to a passenger session to start a drop.</p>
        ) : null}
      </main>
    </Phone>
  );
}
