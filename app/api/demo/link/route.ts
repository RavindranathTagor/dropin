import os from "os";
import QRCode from "qrcode";
import { query, ready } from "@/lib/db";
import { ok } from "@/lib/http";

function lanAddresses() {
  const found: { address: string; score: number }[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const family = entry.family as string | number;
      if (entry.internal || (family !== "IPv4" && family !== 4)) continue;
      let score = 1;
      if (entry.address.startsWith("192.168.56.") || entry.address.startsWith("172.")) score = 0;
      else if (/^192\.168\.(0|1)\./.test(entry.address)) score = 4;
      else if (entry.address.startsWith("192.168.")) score = 3;
      else if (entry.address.startsWith("10.")) score = 2;
      found.push({ address: entry.address, score });
    }
  }
  found.sort((a, b) => b.score - a.score || a.address.localeCompare(b.address));
  const usable = found.filter((item) => item.score > 0);
  return (usable.length ? usable : found).map((item) => item.address);
}

export async function GET(request: Request) {
  await ready();
  const requested = new URL(request.url);
  const port = requested.port || process.env.PORT || "3000";
  const hosts = lanAddresses();
  const links = (hosts.length ? hosts : ["localhost"]).map((host) => `http://${host}:${port}/demo`);
  const url = links[0];
  const qr = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    color: { dark: "#121417", light: "#ffffff" },
  });
  const rooms = await query<{
    origin: string;
    destination: string;
    share_code: string;
    members: number;
    bids: number;
  }>(
    `select rt.origin, rt.destination, dr.share_code,
            (select count(*)::int from drop_members m where m.room_id = dr.id and m.commitment_status <> 'left') as members,
            (select count(*)::int from operator_bids b where b.room_id = dr.id and b.status <> 'withdrawn') as bids
     from drop_rooms dr
     join routes rt on rt.id = dr.route_id
     where dr.drill = false
     order by dr.created_at desc
     limit 8`,
  );
  return ok({
    ok: true,
    url,
    links,
    qr,
    rooms: rooms.map((room) => ({
      origin: room.origin,
      destination: room.destination,
      share_code: room.share_code,
      members: Number(room.members),
      bids: Number(room.bids),
    })),
    at: new Date().toISOString(),
  });
}
