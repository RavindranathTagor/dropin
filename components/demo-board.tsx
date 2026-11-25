"use client";

import { useEffect, useState } from "react";
import { DEMO_ACCOUNTS } from "@/lib/constants";
import { request } from "@/lib/browser";

type RoomPulse = {
  origin: string;
  destination: string;
  share_code: string;
  members: number;
  bids: number;
};

type LinkPayload = {
  url?: string;
  links?: string[];
  qr?: string;
  rooms?: RoomPulse[];
  at?: string;
};

const HINTS: Record<string, string> = {
  "passenger@ghardrop.dev": "Phone 1 · traveller",
  "passenger2@ghardrop.dev": "Phone 2 · traveller",
  "operator@ghardrop.dev": "Phone 3 · operator",
  "operator.malnad@ghardrop.dev": "Spare operator",
  "admin@ghardrop.dev": "This laptop · admin",
};

function destinationFor(role: string) {
  if (role.startsWith("Operator")) return "/operator";
  if (role === "Admin") return "/admin";
  return "/";
}

export function DemoBoard() {
  const [payload, setPayload] = useState<LinkPayload | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stopped = false;
    async function load() {
      const { data } = await request("/api/demo/link", { busy: false });
      if (!stopped) setPayload(data as LinkPayload);
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);

  async function enter(email: string, password: string, role: string) {
    setMessage("");
    const { response } = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      setMessage("That sign-in did not work. Keep this page open and try again.");
      return;
    }
    window.location.assign(destinationFor(role));
  }

  const svg = (payload?.qr || "").replace(/<\?xml[^>]*>/, "");
  const clock = payload?.at ? new Date(payload.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "waiting";

  return (
    <main className="min-h-screen bg-canvas px-4 py-6 text-ink">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[280px_1fr]">
        <section className="rounded-3xl bg-paper p-4">
          <p className="text-sm font-semibold text-slate">Same Wi-Fi</p>
          <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">Open this on each phone</h1>
          <p className="mt-3 break-all font-display text-xl font-semibold">{payload?.url || "Finding this laptop…"}</p>
          {svg ? <div className="mt-4 max-w-full overflow-hidden rounded-2xl border border-line bg-paper p-3 [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
          <ul className="mt-3 space-y-1 text-sm text-slate">
            {(payload?.links || []).slice(1).map((link) => (
              <li key={link}>{link}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate">If a phone cannot open it, allow Node.js through Windows Firewall for private networks.</p>
        </section>
        <section className="space-y-4">
          <div className="rounded-3xl bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">Who is on which screen</h2>
              <span className="rounded-full bg-sun px-3 py-1 text-sm font-semibold">Live {clock}</span>
            </div>
            <p className="mt-2 text-sm text-slate">
              Two phones are travellers. The third phone is the operator, because the demo needs a bid. Leave the laptop on admin. Each sign-in is its own session, and every screen reads the same drop every 3 seconds.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  className="rounded-2xl border border-line bg-paper px-4 py-3 text-left hover:border-ink"
                  key={account.email}
                  onClick={() => void enter(account.email, account.password, account.role)}
                  type="button"
                >
                  <span className="block font-semibold">{account.name}</span>
                  <span className="text-sm text-slate">{HINTS[account.email]}</span>
                </button>
              ))}
            </div>
            {message ? <p className="mt-3 rounded-2xl bg-sun-wash px-3 py-2 text-sm">{message}</p> : null}
          </div>
          <div className="rounded-3xl bg-paper p-4">
            <h2 className="font-display text-2xl font-semibold">Drops right now</h2>
            <ul className="mt-3 space-y-2">
              {(payload?.rooms || []).map((room) => (
                <li className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3" key={room.share_code}>
                  <span>
                    <span className="block font-semibold">
                      {room.origin} → {room.destination}
                    </span>
                    <span className="text-sm text-slate">{room.share_code}</span>
                  </span>
                  <span className="text-right text-sm font-semibold">
                    {room.members} people
                    <span className="block text-slate">{room.bids} bids</span>
                  </span>
                </li>
              ))}
              {payload && (payload.rooms || []).length === 0 ? <li className="text-sm text-slate">No open drops yet. A traveller creates one from the home screen.</li> : null}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
