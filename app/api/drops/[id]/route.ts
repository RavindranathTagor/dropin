import { getDrop } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const drop = await getDrop(id, auth.user.id);
    if (!drop) return bad(new Error("room_not_found"), 404);
    return ok({ ok: true, ...drop });
  } catch (error) {
    return bad(error, 500);
  }
}
