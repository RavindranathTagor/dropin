import { Resolver } from "node:dns/promises";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { DISPOSABLE_DOMAIN_SET } from "@/lib/disposable-domains";
import { query } from "@/lib/db";

export type CrewScope = "open" | "campus" | "tech_park" | "verified_peer" | "tier3";

export type CrewBadge = "personal" | "academic" | "corporate";

export type Classification = {
  email: string;
  domain: string;
  registrable: string;
  kind: CrewBadge | "invalid";
  badge: CrewBadge | null;
  organisation: string | null;
  verifiedPeer: false;
  tier: 1 | 2;
};

export type CrewActor = {
  trustTier: number;
  badge: CrewBadge | null;
  organisation: string | null;
  domain: string | null;
};

export type RoomGate = {
  scope: CrewScope;
  organisation: string | null;
};

const FREE_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "outlook.com",
  "outlook.in",
  "hotmail.com",
  "hotmail.co.in",
  "live.com",
  "live.in",
  "rediffmail.com",
]);

const CAMPUS_NAMES: Record<string, string> = {
  "dsatm.edu.in": "DSATM",
  "pes.edu": "PES",
  "rvce.edu.in": "RVCE",
  "bmsce.ac.in": "BMSCE",
  "msrit.edu": "MSRIT",
  "iisc.ac.in": "IISc",
};

const ACADEMIC_SUFFIXES = ["edu", "edu.in", "ac.in"];

const MULTI_SUFFIXES = [".co.in", ".com.au", ".co.uk", ".ac.uk", ".org.in", ".net.in", ".edu.in", ".ac.in", ".gov.in", ".org.uk"];

const PERSONAL_MESSAGE =
  "A personal email stays Tier 1. Crewmark does not give it a Verified Peer badge. You can browse drops and use reality check.";

const TIER1_HOLD =
  "Crewmark keeps this drop inside the organisation. A personal email can browse and use reality check, and cannot hold a seat here.";

const TIER3_MESSAGE =
  "This room requires Tier 3, the ID layer. That is an optional DigiLocker or Aadhaar check, or a driving licence, plus LinkedIn. This build does not run that check.";

export function normalizeScope(value: unknown): CrewScope {
  if (value === "campus" || value === "tech_park" || value === "verified_peer" || value === "tier3") return value;
  return "open";
}

export function classifyEmail(raw: string): Classification {
  const email = raw.trim().toLowerCase();
  const domain = email.split("@")[1] || "";
  const registrable = domain ? registrableDomain(domain) : "";
  const base = {
    email,
    domain,
    registrable,
    verifiedPeer: false as const,
  };
  if (!domain || !email.includes("@") || domain.includes(" ") || !domain.includes(".")) {
    return { ...base, kind: "invalid", badge: null, organisation: null, tier: 1 };
  }
  if (registrable === "ghardrop.dev") {
    return { ...base, kind: "corporate", badge: "corporate", organisation: "Dropin", tier: 2 };
  }
  if (isListed(domain, registrable, FREE_DOMAINS) || isListed(domain, registrable, DISPOSABLE_DOMAIN_SET)) {
    return { ...base, kind: "personal", badge: "personal", organisation: null, tier: 1 };
  }
  const campus = campusKey(domain);
  if (campus || isAcademic(domain)) {
    const key = campus || registrable;
    return {
      ...base,
      kind: "academic",
      badge: "academic",
      organisation: CAMPUS_NAMES[key] || organisationLabel(registrable),
      tier: 2,
    };
  }
  return {
    ...base,
    kind: "corporate",
    badge: "corporate",
    organisation: organisationLabel(registrable),
    tier: 2,
  };
}

export function tierAfterProof(classification: Classification, proved: boolean) {
  if (!proved) return 1;
  if (classification.kind === "academic" || classification.kind === "corporate") return 2;
  return 1;
}

export function canCreateRoom(actor: CrewActor, scope: CrewScope): { ok: true } | { ok: false; code: string; message: string } {
  if (scope === "open") return { ok: true };
  const verified = actor.trustTier >= 2 && (actor.badge === "academic" || actor.badge === "corporate");
  if (!verified) {
    return {
      ok: false,
      code: "crewmark_tier1",
      message: "Verify a college or work email with Crewmark before you open a restricted drop.",
    };
  }
  if (scope === "campus" && actor.badge !== "academic") {
    return { ok: false, code: "crewmark_campus", message: "Campus rooms are for a verified academic email." };
  }
  if (scope === "tech_park" && actor.badge !== "corporate") {
    return { ok: false, code: "crewmark_company", message: "Company rooms are for a verified work email." };
  }
  return { ok: true };
}

export function accessRoom(actor: CrewActor, room: RoomGate): { ok: true } | { ok: false; code: string; message: string } {
  if (room.scope === "open") return { ok: true };
  if (room.scope === "tier3") {
    if (actor.trustTier >= 3) return { ok: true };
    return { ok: false, code: "crewmark_tier3", message: TIER3_MESSAGE };
  }
  const verified = actor.trustTier >= 2 && (actor.badge === "academic" || actor.badge === "corporate");
  if (!verified) return { ok: false, code: "crewmark_tier1", message: TIER1_HOLD };
  if (room.scope === "verified_peer") return { ok: true };
  if (room.scope === "campus") {
    if (actor.badge === "academic" && sameOrg(actor.organisation, room.organisation)) return { ok: true };
    return {
      ok: false,
      code: "crewmark_org",
      message: `This Crewmark room is for ${room.organisation || "that campus"}. Verified peers of that organisation can join.`,
    };
  }
  if (room.scope === "tech_park") {
    if (actor.badge === "corporate" && sameOrg(actor.organisation, room.organisation)) return { ok: true };
    return {
      ok: false,
      code: "crewmark_org",
      message: `This Crewmark room is for ${room.organisation || "that company"}. Verified peers of that organisation can join.`,
    };
  }
  return { ok: false, code: "crewmark_scope", message: "This Crewmark room is restricted." };
}

export function personalEmailMessage() {
  return PERSONAL_MESSAGE;
}

export async function organisationalMx(domain: string) {
  if (domain === "ghardrop.dev" || domain.endsWith(".ghardrop.dev")) return { note: null as string | null };
  const resolver = new Resolver();
  try {
    const records = await Promise.race([
      resolver.resolveMx(domain),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), 800);
      }),
    ]);
    if (Array.isArray(records) && records.length > 0) return { note: null };
  } catch {
    // DNS missing or slow. The demo still treats the domain as organisational.
  }
  return { note: "domain looks organisational" };
}

export function newOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtp(code: string) {
  const pepper = process.env.SESSION_SECRET || "ghardrop-dev-session-secret";
  return createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

export function otpMatches(code: string, stored: string) {
  const actual = Buffer.from(hashOtp(code));
  const expected = Buffer.from(stored);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function loadActor(userId: string): Promise<CrewActor> {
  const rows = await query<{
    trust_tier: number | string | null;
    crewmark_badge: string | null;
    organisation_name: string | null;
    organisation_domain: string | null;
  }>(
    `select trust_tier, crewmark_badge, organisation_name, organisation_domain from profiles where id = $1`,
    [userId],
  );
  const row = rows[0];
  const badge = row?.crewmark_badge === "academic" || row?.crewmark_badge === "corporate" || row?.crewmark_badge === "personal"
    ? row.crewmark_badge
    : null;
  return {
    trustTier: Number(row?.trust_tier ?? 1),
    badge,
    organisation: row?.organisation_name ?? null,
    domain: row?.organisation_domain ?? null,
  };
}

export async function assertCrewmarkHold(userId: string, roomId: string) {
  const rooms = await query<{ crewmark_scope: string | null; crewmark_org: string | null; drill: boolean }>(
    `select crewmark_scope, crewmark_org, drill from drop_rooms where id = $1`,
    [roomId],
  );
  const room = rooms[0];
  if (!room || room.drill) return { ok: true as const };
  const actor = await loadActor(userId);
  return accessRoom(actor, { scope: normalizeScope(room.crewmark_scope), organisation: room.crewmark_org });
}

function sameOrg(left: string | null, right: string | null) {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function isListed(domain: string, registrable: string, list: Set<string>) {
  return list.has(domain) || list.has(registrable);
}

function isAcademic(domain: string) {
  return ACADEMIC_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
}

function campusKey(domain: string) {
  return Object.keys(CAMPUS_NAMES).find((key) => domain === key || domain.endsWith(`.${key}`)) || null;
}

function registrableDomain(domain: string) {
  const value = domain.toLowerCase();
  for (const suffix of MULTI_SUFFIXES) {
    if (value.endsWith(suffix)) {
      const head = value.slice(0, -suffix.length);
      const label = head.split(".").filter(Boolean).pop();
      return label ? `${label}${suffix}` : value;
    }
  }
  const parts = value.split(".").filter(Boolean);
  if (parts.length <= 2) return value;
  return parts.slice(-2).join(".");
}

function organisationLabel(registrable: string) {
  if (registrable === "ghardrop.dev") return "Dropin";
  if (CAMPUS_NAMES[registrable]) return CAMPUS_NAMES[registrable];
  const label = registrable.split(".")[0] || registrable;
  if (label.length <= 3) return label.toUpperCase();
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}
