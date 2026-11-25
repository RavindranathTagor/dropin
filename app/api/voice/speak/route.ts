import { synthesizeSpeech } from "@/lib/sarvam";
import { bad, ok, reject, withUser } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const body = (await request.json()) as { text?: string; language?: string };
    const text = String(body.text || "").trim();
    if (!text) return bad(new Error("text_required"));
    const spoken = await synthesizeSpeech(text, body.language || "en-IN");
    if (!spoken.ok) return ok({ ok: false, error: spoken.error }, spoken.error === "tts_unavailable" ? 503 : 502);
    return ok({ ok: true, audio: spoken.audio, mime: "audio/wav" });
  } catch (error) {
    return bad(error, 500);
  }
}
