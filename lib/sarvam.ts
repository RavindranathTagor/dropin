const TTS_LANGUAGES = new Set([
  "en-IN",
  "hi-IN",
  "bn-IN",
  "ta-IN",
  "te-IN",
  "gu-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "pa-IN",
  "od-IN",
]);

export function sarvamConfigured() {
  return Boolean(process.env.SARVAM_API_KEY);
}

export async function transcribeAudio(file: File, mode: "transcribe" | "translate") {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return { ok: false as const, error: "sarvam_unconfigured" as const };
  const body = new FormData();
  body.append("file", file);
  body.append("model", "saaras:v4");
  body.append("mode", mode);
  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": key },
    body,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    return { ok: false as const, error: "sarvam_failed" as const, detail };
  }
  const json = (await response.json()) as { transcript?: string; language_code?: string | null };
  return {
    ok: true as const,
    transcript: json.transcript ?? "",
    languageCode: json.language_code ?? null,
  };
}

export async function translateText(input: string, targetLanguage: string) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return { ok: false as const, error: "sarvam_unconfigured" as const, text: input };
  if (targetLanguage === "en-IN") return { ok: true as const, text: input };
  const response = await fetch("https://api.sarvam.ai/translate", {
    method: "POST",
    headers: {
      "api-subscription-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: input.slice(0, 1000),
      source_language_code: "en-IN",
      target_language_code: targetLanguage,
      model: "sarvam-translate:v1",
      mode: "formal",
    }),
  });
  if (!response.ok) return { ok: false as const, error: "translate_failed" as const, text: input };
  const json = (await response.json()) as { translated_text?: string; output?: string };
  return { ok: true as const, text: json.translated_text || json.output || input };
}

export async function synthesizeSpeech(text: string, languageCode: string) {
  const key = process.env.SARVAM_API_KEY;
  if (!key || !TTS_LANGUAGES.has(languageCode)) {
    return { ok: false as const, error: "tts_unavailable" as const };
  }
  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "api-subscription-key": key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text: text.slice(0, 500),
      language_code: languageCode,
      model: "bulbul:v4-flash",
      speaker: "shubh_enhi_ads",
    }),
  });
  if (!response.ok) return { ok: false as const, error: "tts_failed" as const };
  const json = (await response.json()) as { audios?: string[] };
  const audio = json.audios?.[0];
  if (!audio) return { ok: false as const, error: "tts_empty" as const };
  return { ok: true as const, audio };
}
