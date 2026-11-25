import { parseTrip } from "@/lib/parse-trip";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as { text?: string };
    if (!body.text?.trim()) return bad(new Error("text_required"));
    return ok({ ok: true, draft: parseTrip(body.text), needs_confirmation: true });
  } catch (error) {
    return bad(error, 500);
  }
}
