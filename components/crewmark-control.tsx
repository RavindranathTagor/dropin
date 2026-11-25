"use client";

import { useEffect, useState } from "react";
import { request } from "@/lib/browser";
import { SelectInput, TextInput } from "@/components/ui/input";

type Profile = {
  email: string;
  trust_tier: number;
  crewmark_badge: string | null;
  organisation_name: string | null;
};

export function CrewmarkControl({
  scope,
  onScope,
  locked = false,
}: {
  scope: string;
  onScope: (scope: string) => void;
  locked?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await request("/api/auth/me", { busy: false });
    const user = data.user as Profile | null;
    setProfile(user);
  }

  useEffect(() => {
    void load();
  }, []);

  const tier = Number(profile?.trust_tier ?? 1);
  const verified = tier >= 2 && (profile?.crewmark_badge === "academic" || profile?.crewmark_badge === "corporate");
  const org = profile?.organisation_name || "your organisation";
  const academic = profile?.crewmark_badge === "academic";
  const corporate = profile?.crewmark_badge === "corporate";

  async function sendCode() {
    setBusy(true);
    const { response, data } = await request("/api/crewmark/otp", { method: "POST" });
    setBusy(false);
    if (!response.ok) {
      setNote(String(data.error || "The code could not be sent."));
      return;
    }
    if (data.verifiedPeer === false && data.tier === 1 && data.message) {
      setNote(String(data.message));
      return;
    }
    const shown = typeof data.otp === "string" ? ` Code ${data.otp}.` : "";
    const look = data.domain_note ? ` ${String(data.domain_note)}.` : "";
    setNote(`Code sent to ${profile?.email || "your email"}.${shown}${look}`);
  }

  async function confirmCode() {
    setBusy(true);
    const { response, data } = await request("/api/crewmark/otp/confirm", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!response.ok || data.ok === false) {
      setNote(String(data.message || data.error || "That code does not match."));
      return;
    }
    setCode("");
    setNote(`${data.organisation || org} is a Verified Peer.`);
    await load();
  }

  return (
    <section className="rounded-3xl border border-line p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Crewmark</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${verified ? "bg-trust-wash text-trust" : "bg-canvas text-slate"}`}>
          {verified ? "Verified Peer" : "Tier 1"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate">
        {verified
          ? `${profile?.crewmark_badge === "academic" ? "Campus" : "Company"} · ${org}. Keep this drop inside the organisation, or leave it open.`
          : "A personal email can browse and check fares. Verify a college or work email to hold a seat in a restricted drop."}
      </p>
      {locked ? null : <label className="mt-3 block">
        <span className="mb-1 block text-sm font-semibold text-slate">Who can hold a seat</span>
        <SelectInput onChange={(event) => onScope(event.target.value)} value={scope}>
          <option value="open">Anyone</option>
          {academic ? <option value="campus">My campus · {org}</option> : null}
          {corporate ? <option value="tech_park">My company · {org}</option> : null}
          {!verified ? <option value="campus">My campus</option> : null}
          {!verified ? <option value="tech_park">My company</option> : null}
          <option value="verified_peer">Verified peers</option>
          <option value="tier3">Tier 3 · ID layer</option>
        </SelectInput>
      </label>}
      {scope === "tier3" ? (
        <p className="mt-2 text-sm text-slate">
          Tier 3 is the ID layer: DigiLocker or Aadhaar, or a driving licence, plus LinkedIn. This build does not run that check.
        </p>
      ) : null}
      {!verified ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm">{profile?.email}</p>
          <div className="flex gap-2">
            <TextInput
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              value={code}
            />
            <button className="min-h-12 shrink-0 rounded-full border border-line px-4 text-sm font-semibold" disabled={busy} onClick={() => void sendCode()} type="button">
              Send code
            </button>
          </div>
          <button className="min-h-11 text-sm font-semibold" disabled={busy || code.length !== 6} onClick={() => void confirmCode()} type="button">
            Confirm code
          </button>
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm">{note}</p> : null}
    </section>
  );
}
