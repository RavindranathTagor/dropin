import { clearSession, loginWithPassword } from "@/lib/auth";
import { ready } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export async function POST(request: Request) {
  try {
    await ready();
    const body = (await request.json()) as { email?: string; password?: string };
    if (!body.email || !body.password) return bad(new Error("email_and_password_required"));
    const user = await loginWithPassword(body.email, body.password);
    if (!user) return bad(new Error("sign_in_failed"), 401);
    return ok({ ok: true, user });
  } catch (error) {
    return bad(error, 500);
  }
}

export async function DELETE() {
  await clearSession();
  return ok({ ok: true });
}
