import { joinDrop } from "@/lib/drops";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await withUser(["passenger"]);
    if (auth.error || !auth.user) return reject(auth);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { seats?: number; offered_fare?: number | null };
    const result = await joinDrop(id, auth.user.id, Number(body.seats || 1), body.offered_fare);
    return ok({ ok: true, ...result });
  } catch (error) {
    return bad(error);
  }
}
