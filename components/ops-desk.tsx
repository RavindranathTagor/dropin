"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { request } from "@/lib/browser";

type Evidence = {
  health: { recent_attempts: number; recent_failures: number; p95_latency_ms: number; booking_writes_paused: boolean; active_bookings: number };
  attempts: { id: string; outcome: string; error_code: string | null; latency_ms: number | null; remaining_seats: number | null; source: string; created_at: string }[];
  dispatches: { id: string; response_status: number | null; response_body: string | null; connected: boolean; created_at: string }[];
  nudgebee: { webhookConfigured: boolean; tokenConfigured: boolean; apiReachable: boolean; account: string | null; lastDelivered: boolean; lastStatus: number | null };
  note: string;
};

export function OpsDesk() {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const { response, data } = await request("/api/internal/ops/evidence", { busy: false });
    if (!response.ok) {
      setMessage("This page is for an admin session.");
      return;
    }
    setEvidence(data as unknown as Evidence);
  }

  useEffect(() => {
    void load();
  }, []);

  async function pause(paused: boolean) {
    const { response, data } = await request("/api/internal/ops/pause-bookings", {
      method: "POST",
      body: JSON.stringify({ paused, reason: paused ? "Admin paused booking writes" : "Admin resumed booking writes" }),
    });
    setMessage(response.ok ? (paused ? "New booking writes are paused." : "Booking writes are resumed.") : String(data.error || "The pause did not apply."));
    await load();
  }

  async function drill() {
    setMessage("Running the labelled capacity drill…");
    const { response, data } = await request("/api/internal/ops/contention", { method: "POST" });
    if (!response.ok) {
      setMessage(String(data.error || "The drill did not run."));
      return;
    }
    const results = (data.results as { ok: boolean; error?: string }[]) || [];
    const held = results.filter((item) => item.ok).length;
    const refused = results.length - held;
    setMessage(`Labelled test incident: ${held} seats held, ${refused} refused because the drill vehicle was full. This used the labelled drill vehicle.`);
    await load();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-6xl">
        <AppHeader subtitle="Booking health" />
        <main className="space-y-5 px-6 py-6">
          <Link className="text-sm font-semibold underline" href="/admin">Back to the desk</Link>
          <h1 className="font-display text-3xl font-semibold">Booking commitment health</h1>
          {message ? <p className="rounded-2xl bg-sun-wash px-4 py-3">{message}</p> : null}
          {evidence ? (
            <>
              <section className="grid gap-3 md:grid-cols-4">
                <Tile label="Recent attempts" value={String(evidence.health.recent_attempts)} />
                <Tile label="Recent failures" value={String(evidence.health.recent_failures)} />
                <Tile label="P95 latency" value={`${evidence.health.p95_latency_ms} ms`} />
                <Tile label="Writes" value={evidence.health.booking_writes_paused ? "Paused" : "Open"} />
              </section>
              <section className="rounded-3xl bg-paper p-4">
                <h2 className="font-display text-xl font-semibold">NudgeBee</h2>
                <p className="mt-2 text-sm">{evidence.dispatches[0]?.connected ? "Delivered" : "Waiting"}</p>
              </section>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void pause(true)} type="button">Pause booking writes</Button>
                <Button onClick={() => void pause(false)} type="button" variant="secondary">Resume booking writes</Button>
                <Button onClick={() => void drill()} type="button" variant="secondary">Run labelled capacity test</Button>
              </div>
              <section className="rounded-3xl bg-paper p-4">
                <h2 className="font-display text-xl font-semibold">Recent attempts</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {evidence.attempts.map((attempt) => (
                    <li className="border-t border-line py-2" key={attempt.id}>
                      {attempt.source} · {attempt.outcome}{attempt.error_code ? ` · ${attempt.error_code}` : ""} · {attempt.latency_ms ?? "—"} ms · seats left {attempt.remaining_seats ?? "—"}
                    </li>
                  ))}
                  {evidence.attempts.length === 0 ? <li>No booking attempts yet.</li> : null}
                </ul>
              </section>
              <section className="rounded-3xl bg-paper p-4">
                <h2 className="font-display text-xl font-semibold">Webhook dispatches</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {evidence.dispatches.map((dispatch) => (
                    <li className="border-t border-line py-2" key={dispatch.id}>
                      {dispatch.connected ? "Delivered" : "Waiting"} · status {dispatch.response_status ?? "—"}
                    </li>
                  ))}
                  {evidence.dispatches.length === 0 ? <li>Waiting</li> : null}
                </ul>
              </section>
            </>
          ) : (
            <p>{message || "Loading evidence…"}</p>
          )}
        </main>
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-paper p-4">
      <p className="text-sm text-slate">{label}</p>
      <p className="font-display text-3xl font-semibold">{value}</p>
    </div>
  );
}
