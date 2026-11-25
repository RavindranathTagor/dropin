"use client";

import { useEffect, useState } from "react";
import { Phone } from "@/components/shell";
import { Mark, Wordmark } from "@/components/mark";
import { request } from "@/lib/browser";

type Note = {
  message: string;
  translated_message: string | null;
  language: string;
  audio_base64: string | null;
  delivery_status: string;
  created_at: string;
};

export function FamilyView({ token }: { token: string }) {
  const [contact, setContact] = useState<{ contact_name: string; passenger_name: string; language: string } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void request(`/api/family/${token}`, { busy: false }).then(({ response, data }) => {
      if (!response.ok) {
        setMissing(true);
        return;
      }
      setContact(data.contact as { contact_name: string; passenger_name: string; language: string });
      setNotes((data.notifications as Note[]) || []);
    });
  }, [token]);

  return (
    <Phone>
      <main className="space-y-5 px-5 py-8">
        <div className="flex items-center gap-2">
          <Mark className="h-12 w-14" />
          <Wordmark />
        </div>
        {missing ? <p className="text-xl">This family link is not active.</p> : null}
        {contact ? (
          <>
            <h1 className="font-display text-4xl font-semibold leading-tight">Hello {contact.contact_name}</h1>
            <p className="text-xl text-slate">Updates for {contact.passenger_name}. These are trip milestones, not a live location.</p>
          </>
        ) : null}
        {notes.length === 0 && contact ? <p className="rounded-3xl bg-canvas p-4 text-lg">No journey milestone yet. A message is sent only after a confirmed trip event.</p> : null}
        {notes.map((note) => (
          <article className="space-y-3 rounded-3xl border border-line p-4" key={note.created_at}>
            <p className="text-2xl leading-snug">{note.translated_message || note.message}</p>
            {note.language !== "en-IN" ? <p className="text-base text-slate">{note.message}</p> : null}
            {note.audio_base64 ? <audio controls src={`data:audio/wav;base64,${note.audio_base64}`} /> : <p className="text-base">Voice is unavailable for this update, so the message stays as text.</p>}
            <p className="text-sm text-slate">{note.delivery_status.replaceAll("_", " ")}</p>
          </article>
        ))}
      </main>
    </Phone>
  );
}
