"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader, Phone } from "@/components/shell";
import { RouteRibbon } from "@/components/route-ribbon";
import { RouteMap } from "@/components/route-map";
import { request } from "@/lib/browser";
import { formatInr, formatWhen } from "@/lib/format";

type Room = {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  departure_window: string;
  member_count: number;
  confirmed_seats: number;
  target_occupancy: number | null;
  lowest_quote: number | null;
};

export function DropList() {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    void request("/api/drops", { busy: false }).then(({ data }) => setRooms((data.rooms as Room[]) || []));
  }, []);

  return (
    <Phone>
      <AppHeader />
      <main className="space-y-3 px-4 py-5">
        <h1 className="font-display text-3xl font-semibold">Open drops</h1>
        <RouteMap destination={rooms[0]?.destination || "Mangaluru"} origin={rooms[0]?.origin || "Bengaluru"} />
        {rooms.map((room) => (
          <Link className="block rounded-3xl border border-line p-4" href={`/drops/${room.id}`} key={room.id}>
            <RouteRibbon destination={room.destination} meta={formatWhen(room.departure_date, room.departure_window)} origin={room.origin} />
            <p className="mt-3 text-sm">{room.member_count} in the group · {room.confirmed_seats} seats held · target {room.target_occupancy ?? "—"}</p>
            <p className="text-sm text-slate">{room.lowest_quote ? `Operator quotes from ${formatInr(room.lowest_quote)}` : "Waiting for an operator quote"}</p>
          </Link>
        ))}
        {rooms.length === 0 ? <p className="text-slate">No open drops yet.</p> : null}
      </main>
    </Phone>
  );
}
