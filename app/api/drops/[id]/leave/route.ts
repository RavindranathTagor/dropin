import { leaveDrop } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    await leaveDrop(id, auth.user.id);
    return ok({ ok: true });
  } catch (error) {
    return bad(error);
  }
}
