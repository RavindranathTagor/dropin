import { randomUUID } from "crypto";
import { VEHICLE_LABELS } from "@/lib/constants";
import { query } from "@/lib/db";
import { synthesizeSpeech, translateText } from "@/lib/sarvam";

export type Milestone = "operator_accepted" | "confirmed" | "departed" | "completed";

export function milestoneCopy(input: {
  event: Milestone;
  origin: string;
  destination: string;
  pickup: string | null;
  time: string | null;
  vehicle: string;
  seats: number;
}) {
  const place = input.pickup ? ` Pickup: ${input.pickup}.` : "";
  const when = input.time ? ` Departure time: ${input.time}.` : "";
  const vehicle = ` Vehicle: ${input.vehicle}, ${input.seats} seats.`;
  const tail = " This is a booking milestone, not a live location.";
  if (input.event === "operator_accepted") {
    return `Dropin: a seat is held for the ${input.origin} to ${input.destination} group. The operator accepted the offer. The trip is not confirmed until the group reaches the confirmation threshold.${place}${when}${vehicle}${tail}`;
  }
  if (input.event === "confirmed") {
    return `Dropin: the ${input.origin} to ${input.destination} group booking is confirmed.${place}${when}${vehicle}${tail}`;
  }
  if (input.event === "departed") {
    return `Dropin: the ${input.origin} to ${input.destination} group has departed.${place}${when}${vehicle}${tail}`;
  }
  return `Dropin: the ${input.origin} to ${input.destination} trip is marked completed.${vehicle}${tail}`;
}

export async function saveFamilyContact(input: {
  passengerId: string;
  contactName: string;
  language: string;
}) {
  if (!input.contactName.trim()) throw new Error("contact_name_required");
  if (!["en-IN", "kn-IN", "hi-IN", "ta-IN", "te-IN"].includes(input.language)) throw new Error("language_required");
  const existing = await query<{ id: string; token: string }>(
    `select id, token from family_contacts where passenger_id = $1 order by consented_at desc limit 1`,
    [input.passengerId],
  );
  if (existing[0]) {
    await query(
      `update family_contacts set contact_name = $1, language = $2, consented_at = now() where id = $3`,
      [input.contactName.trim(), input.language, existing[0].id],
    );
    return { token: existing[0].token };
  }
  const token = randomUUID().replaceAll("-", "");
  await query(
    `insert into family_contacts (passenger_id, contact_name, language, token) values ($1, $2, $3, $4)`,
    [input.passengerId, input.contactName.trim(), input.language, token],
  );
  return { token };
}

export async function recordMilestone(bookingId: string, event: Milestone, actorId: string) {
  await query(
    `insert into journey_events (booking_id, event_type, evidence) values ($1, $2, $3::jsonb)`,
    [bookingId, event, JSON.stringify({ actor_id: actorId })],
  );
  await notifyBooking(bookingId, event);
}

export async function notifyBooking(bookingId: string, event: Milestone) {
  const rows = await query<{
    passenger_id: string;
    origin: string;
    destination: string;
    pickup_point: string | null;
    departure_time: string | null;
    vehicle_type: string | null;
    capacity: number | null;
  }>(
    `select b.passenger_id, rt.origin, rt.destination, ob.pickup_point, ob.departure_time, v.type as vehicle_type, v.capacity
     from bookings b
     join drop_rooms dr on dr.id = b.room_id
     join routes rt on rt.id = dr.route_id
     left join operator_bids ob on ob.id = b.bid_id
     left join vehicles v on v.id = ob.vehicle_id
     where b.id = $1`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) return;
  const contacts = await query<{ id: string; language: string; passenger_id: string }>(
    `select id, language, passenger_id from family_contacts where passenger_id = $1`,
    [booking.passenger_id],
  );
  const english = milestoneCopy({
    event,
    origin: booking.origin,
    destination: booking.destination,
    pickup: booking.pickup_point,
    time: booking.departure_time,
    vehicle: VEHICLE_LABELS[booking.vehicle_type ?? ""] ?? "vehicle",
    seats: booking.capacity ?? 0,
  });
  for (const contact of contacts) {
    const translated = await translateText(english, contact.language);
    let audio: string | null = null;
    let delivery = translated.ok ? "translated" : "text_fallback";
    if (translated.ok) {
      const speech = await synthesizeSpeech(translated.text, contact.language);
      if (speech.ok) {
        audio = speech.audio;
        delivery = "ready";
      } else {
        delivery = "text_fallback";
      }
    }
    await query(
      `insert into notifications (
        user_id, family_contact_id, booking_id, message, translated_message, language, audio_base64, delivery_status
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        contact.passenger_id,
        contact.id,
        bookingId,
        english,
        translated.text,
        contact.language,
        audio,
        delivery,
      ],
    );
  }
}

export async function familyView(token: string) {
  const contacts = await query<{
    contact_name: string;
    language: string;
    passenger_name: string;
  }>(
    `select fc.contact_name, fc.language, p.name as passenger_name
     from family_contacts fc
     join profiles p on p.id = fc.passenger_id
     where fc.token = $1`,
    [token],
  );
  const contact = contacts[0];
  if (!contact) return null;
  const notes = await query<{
    message: string;
    translated_message: string | null;
    language: string;
    audio_base64: string | null;
    delivery_status: string;
    created_at: string;
  }>(
    `select n.message, n.translated_message, n.language, n.audio_base64, n.delivery_status, n.created_at
     from notifications n
     join family_contacts fc on fc.id = n.family_contact_id
     where fc.token = $1
     order by n.created_at desc
     limit 5`,
    [token],
  );
  return { contact, notifications: notes };
}
