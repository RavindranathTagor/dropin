import { parseBid } from "@/lib/parse-bid";
import { parseTrip } from "@/lib/parse-trip";
import { transcribeAudio } from "@/lib/sarvam";
import { bad, ok, withUser, reject } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const auth = await withUser();
    if (auth.error || !auth.user) return reject(auth);
    const form = await request.formData();
    const uploaded = form.get("file");
    const purpose = String(form.get("purpose") || "trip");
    if (!(uploaded instanceof File)) return bad(new Error("audio_required"));
    if (uploaded.size > 4_000_000) return bad(new Error("audio_too_large"));
    const bytes = await uploaded.arrayBuffer();
    const copy = () => new File([bytes], uploaded.name || "note.webm", { type: uploaded.type || "audio/webm" });
    const [original, english] = await Promise.all([
      transcribeAudio(copy(), "transcribe"),
      transcribeAudio(copy(), "translate"),
    ]);
    if (!original.ok && !english.ok) {
      const missing = original.error === "sarvam_unconfigured";
      return ok(
        {
          ok: false,
          fallback: true,
          error: missing ? "sarvam_unconfigured" : "sarvam_failed",
          detail: "detail" in original ? original.detail : original.error,
        },
        missing ? 503 : 502,
      );
    }
    const transcript = original.ok ? original.transcript : "";
    const translation = english.ok ? english.transcript : transcript;
    const draft = purpose === "bid" ? parseBid(translation || transcript) : parseTrip(translation || transcript);
    return ok({
      ok: true,
      transcript,
      translation,
      languageCode: original.ok ? original.languageCode : null,
      draft,
    });
  } catch (error) {
    return bad(error, 500);
  }
}
