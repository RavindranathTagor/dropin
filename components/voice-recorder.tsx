"use client";

import { useRef, useState } from "react";
import { request } from "@/lib/browser";

export function VoiceRecorder({
  purpose,
  onResult,
  prominent = false,
}: {
  purpose: "trip" | "bid";
  onResult: (result: { transcript: string; translation: string; draft: Record<string, unknown>; error?: string }) => void;
  prominent?: boolean;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const releaseRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else releaseRef.current = true;
  }

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
    if (!stream) {
      releaseRef.current = false;
      setStatus("The microphone is unavailable. Type the trip instead.");
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      };
    });
    recorder.start();
    setRecording(true);
    setStatus("Listening");
    if (releaseRef.current) {
      releaseRef.current = false;
      recorder.stop();
    }
    const timer = window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 20000);
    const audio = await stopped;
    window.clearTimeout(timer);
    recorderRef.current = null;
    setRecording(false);
    setStatus("Transcribing…");
    const body = new FormData();
    body.set("file", new File([audio], "note.webm", { type: audio.type || "audio/webm" }));
    body.set("purpose", purpose);
    const { response, data } = await request("/api/voice/transcribe", { method: "POST", body });
    if (!response.ok || data.ok === false) {
      setStatus("Voice unavailable");
      onResult({ transcript: "", translation: "", draft: {}, error: String(data.error || "sarvam_failed") });
      return;
    }
    setStatus("");
    onResult({
      transcript: String(data.transcript || ""),
      translation: String(data.translation || ""),
      draft: (data.draft as Record<string, unknown>) || {},
    });
  }

  return (
    <div className={prominent ? "flex flex-col items-center gap-3" : "flex items-center gap-2"}>
      {!prominent && status ? <p className="rounded-full bg-paper px-3 py-1 text-xs font-semibold shadow-sm">{status}</p> : null}
      <button
        aria-label={recording ? "Release to transcribe" : "Hold to speak. Audio is transcribed by Sarvam and not stored."}
        className={`grid place-items-center rounded-full bg-sun text-ink shadow-[0_12px_30px_rgba(255,193,7,0.45)] ${recording ? "recording" : ""} ${prominent ? "h-36 w-36" : "h-14 w-14"}`}
        onClick={() => {
          if (prominent) return;
          if (recorderRef.current?.state === "recording") recorderRef.current.stop();
          else void start();
        }}
        onKeyDown={(event) => {
          if (!prominent || (event.key !== " " && event.key !== "Enter") || event.repeat) return;
          event.preventDefault();
          void start();
        }}
        onKeyUp={(event) => {
          if (!prominent || (event.key !== " " && event.key !== "Enter")) return;
          stopRecording();
        }}
        onPointerDown={(event) => {
          if (!prominent || event.button !== 0) return;
          event.preventDefault();
          void start();
        }}
        onPointerCancel={() => {
          stopRecording();
        }}
        onPointerUp={() => {
          if (!prominent) return;
          stopRecording();
        }}
        type="button"
      >
        <svg aria-hidden="true" className={prominent ? "h-12 w-12" : "h-6 w-6"} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z" strokeLinejoin="round" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4" strokeLinecap="round" />
        </svg>
      </button>
      {prominent ? <p className="text-xs font-semibold tracking-[0.14em]">{recording ? "LISTENING" : status === "Transcribing…" ? "TRANSCRIBING" : "HOLD TO SPEAK"}</p> : null}
    </div>
  );
}
