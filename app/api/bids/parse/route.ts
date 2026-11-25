import { parseBid } from "@/lib/parse-bid";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser(["operator", "admin"]);
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as { text?: string };
    if (!body.text?.trim()) return bad(new Error("text_required"));
    return ok({ ok: true, draft: parseBid(body.text), needs_confirmation: true });
  } catch (error) {
    return bad(error, 500);
  }
}
