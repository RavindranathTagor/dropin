"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/browser";
import { formatInr, formatStatus } from "@/lib/format";

type Summary = {
  rooms: { id: string; origin: string; destination: string; departure_date: string; departure_window: string; status: string; drill: boolean; members: number }[];
  bids: { id: string; operator_name: string; fixed_quote: number; status: string; pickup_point: string; capacity: number; type: string; drill: boolean }[];
  operators: { id: string; name: string; phone: string; verification_status: string; demo_label: string | null; contact_details: { documents?: string[] } }[];
  bookings: { id: string; status: string; seats: number; passenger_name: string; origin: string; destination: string; fixed_quote: number | null }[];
  funnel: { variant: string | null; event_name: string; total: number }[];
};

export function AdminDesk() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flags, setFlags] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const [admin, flagResponse] = await Promise.all([request("/api/admin/summary", { busy: false }), request("/api/flags", { busy: false })]);
    if (!admin.response.ok) {
      setMessage("This desk is for an admin session.");
      return;
    }
    setSummary(admin.data as unknown as Summary);
    setFlags((flagResponse.data.flags as Record<string, unknown>) || null);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function review(id: string, status: string) {
    await request(`/api/admin/operators/${id}`, { method: "POST", body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl">
        <AppHeader subtitle="Operations desk" />
        <main className="space-y-6 px-4 py-6 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold sm:text-3xl">Rooms, bids, and bookings</h1>
              <p className="text-sm text-slate">This desk refreshes every 3 seconds from the same server the phones use.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-full border border-line bg-paper px-4 py-3 font-semibold" href="/demo">Phone board</Link>
              <Link className="rounded-full bg-sun px-4 py-3 font-semibold" href="/admin/ops">Booking health</Link>
            </div>
          </div>
          {message ? <p className="rounded-2xl bg-alert-wash px-4 py-3 text-alert">{message}</p> : null}
          <section className="rounded-3xl bg-paper p-4">
            <h2 className="font-display text-xl font-semibold">Flagsmith snapshot</h2>
            <p className="text-sm text-slate">Source: {String(flags?.source || "loading")}.</p>
            <p className="mt-2 text-sm text-slate">
              Sarvam listens and speaks the route. Flagsmith sets this phone to {flags?.voice_launch_experiment === "text_first" ? "text first" : "voice first"}. Seat-hold problems are sent to NudgeBee.
            </p>
            <pre className="mt-3 overflow-auto text-sm">{JSON.stringify(flags, null, 2)}</pre>
            <Button className="mt-3" onClick={() => void load()} type="button" variant="secondary">Refresh flags</Button>
          </section>
          <section className="rounded-3xl bg-paper p-4">
            <h2 className="font-display text-xl font-semibold">Experiment funnel</h2>
            <p className="text-sm text-slate">Join rate is the useful outcome. Microphone taps are only the start.</p>
            <ul className="mt-2 space-y-1 text-sm">
              {(summary?.funnel || []).map((row) => (
                <li key={`${row.variant}-${row.event_name}`}>{row.variant || "unassigned"} · {row.event_name.replaceAll("_", " ")} · {row.total}</li>
              ))}
              {summary && summary.funnel.length === 0 ? <li>No events yet.</li> : null}
            </ul>
          </section>
          <Table title="Drops" rows={(summary?.rooms || []).map((room) => [room.drill ? "Drill" : "Live", `${room.origin} → ${room.destination}`, room.departure_date, room.departure_window, String(room.members), room.status])} />
          <Table title="Bids" rows={(summary?.bids || []).map((bid) => [bid.operator_name, formatInr(Number(bid.fixed_quote)), bid.pickup_point, `${bid.capacity} ${bid.type}`, bid.status])} />
          <section className="rounded-3xl bg-paper p-4">
            <h2 className="font-display text-xl font-semibold">Operators</h2>
            <div className="mt-3 space-y-3">
              {(summary?.operators || []).map((operator) => (
                <article className="rounded-2xl border border-line p-3" key={operator.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{operator.name}</p>
                      <p className="text-sm text-slate">{operator.demo_label}</p>
                      <p className="text-sm">Documents listed for review: {documents(operator.contact_details).join(", ") || "None"}. Sample names, not stored files.</p>
                    </div>
                    <Badge tone={operator.verification_status === "verified" ? "trust" : "sun"}>{operator.verification_status}</Badge>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => void review(operator.id, "verified")} type="button">Mark documents reviewed</Button>
                    <Button onClick={() => void review(operator.id, "pending")} type="button" variant="secondary">Mark pending</Button>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <Table title="Bookings" rows={(summary?.bookings || []).map((booking) => [booking.passenger_name, `${booking.origin} → ${booking.destination}`, formatStatus(booking.status), String(booking.seats), booking.fixed_quote ? formatInr(Number(booking.fixed_quote)) : "—"])} />
        </main>
      </div>
    </div>
  );
}

function documents(value: { documents?: string[] } | string | null) {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return ((JSON.parse(value) as { documents?: string[] }).documents) || [];
    } catch {
      return [];
    }
  }
  return value.documents || [];
}

function Table({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <section className="rounded-3xl bg-paper p-4">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="mt-3 overflow-auto">
        <table className="w-full text-left text-sm">
          <tbody>
            {rows.map((row, index) => (
              <tr className="border-t border-line" key={`${title}-${index}`}>
                {row.map((cell, cellIndex) => (
                  <td className="px-2 py-2" key={`${title}-${index}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
