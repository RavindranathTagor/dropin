import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export type Role = "passenger" | "operator" | "admin";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  affiliation_status: string | null;
  trust_tier: number;
  crewmark_badge: string | null;
  organisation_name: string | null;
  organisation_domain: string | null;
  email_verified_at: string | null;
};

const COOKIE = "ghardrop_session";

function secret() {
  return process.env.SESSION_SECRET || "ghardrop-dev-session-secret";
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function sign(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createSessionToken(userId: string) {
  const body = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 14 * 24 * 60 * 60 * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined | null) {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

const PROFILE_COLUMNS = `id, name, email, phone, role, affiliation_status, trust_tier, crewmark_badge, organisation_name, organisation_domain, email_verified_at`;

function asUser<T extends SessionUser>(row: T): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    affiliation_status: row.affiliation_status,
    trust_tier: Number(row.trust_tier ?? 1),
    crewmark_badge: row.crewmark_badge,
    organisation_name: row.organisation_name,
    organisation_domain: row.organisation_domain,
    email_verified_at: row.email_verified_at ? String(row.email_verified_at) : null,
  };
}

export async function getCurrentUser() {
  const jar = await cookies();
  const userId = readSessionToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const rows = await query<SessionUser>(`select ${PROFILE_COLUMNS} from profiles where id = $1`, [userId]);
  return rows[0] ? asUser(rows[0]) : null;
}

export async function loginWithPassword(email: string, password: string) {
  const rows = await query<SessionUser & { password_hash: string }>(
    `select ${PROFILE_COLUMNS}, password_hash from profiles where lower(email) = lower($1)`,
    [email.trim()],
  );
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  await setSession(user.id);
  return asUser(user);
}
