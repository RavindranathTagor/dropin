import { NextResponse } from "next/server";
import { getCurrentUser, type Role, type SessionUser } from "@/lib/auth";
import { ready } from "@/lib/db";

export async function withUser(roles?: Role[]) {
  await ready();
  const user = await getCurrentUser();
  if (!user) {
    return { user: null as SessionUser | null, error: NextResponse.json({ ok: false, error: "sign_in_required" }, { status: 401 }) };
  }
  if (roles && !roles.includes(user.role)) {
    return { user: null, error: NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 }) };
  }
  return { user, error: null };
}

export async function withOps(request: Request) {
  await ready();
  const user = await getCurrentUser();
  const secret = request.headers.get("x-ops-secret");
  const secretOk = Boolean(process.env.OPS_ACTION_SECRET) && secret === process.env.OPS_ACTION_SECRET;
  if (user?.role === "admin" || secretOk) return { user, error: null };
  return { user: null, error: NextResponse.json({ ok: false, error: "not_allowed" }, { status: 403 }) };
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function reject(result: { error: NextResponse | null }) {
  return result.error ?? NextResponse.json({ ok: false, error: "sign_in_required" }, { status: 401 });
}

export function bad(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "request_failed";
  const code = message === "not_allowed" ? 403 : status;
  return NextResponse.json({ ok: false, error: message }, { status: code });
}
