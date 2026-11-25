"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { cityPoint } from "@/lib/distance";

export function RouteMap({ origin, destination, bare = false }: { origin: string; destination: string; bare?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("Loading the road map.");

  useEffect(() => {
    const mapRef = { current: null as { remove: () => void } | null };
    let cancelled = false;

    async function draw() {
      const from = cityPoint(origin);
      const to = cityPoint(destination);
      if (!from || !to || !host.current) {
        setNote("This place is not on the map yet.");
        return;
      }
      const leaflet = await import("leaflet");
      if (cancelled || !host.current) return;
      const L = leaflet.default;
      const next = L.map(host.current, { zoomControl: true });
      mapRef.current = next;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 16,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(next);
      const start = L.circleMarker([from.lat, from.lng], {
        radius: 8,
        color: "#121417",
        fillColor: "#FFC107",
        fillOpacity: 1,
        weight: 2,
      }).addTo(next);
      const end = L.circleMarker([to.lat, to.lng], {
        radius: 8,
        color: "#121417",
        fillColor: "#FFC107",
        fillOpacity: 1,
        weight: 2,
      }).addTo(next);
      start.bindPopup(origin);
      end.bindPopup(destination);
      let line: [number, number][] = [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ];
      let routed = false;
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
        );
        if (response.ok) {
          const json = (await response.json()) as { routes?: { geometry?: { coordinates?: [number, number][] } }[] };
          const coordinates = json.routes?.[0]?.geometry?.coordinates;
          if (coordinates && coordinates.length > 1) {
            line = coordinates.map(([lng, lat]) => [lat, lng]);
            routed = true;
          }
        }
      } catch {
        routed = false;
      }
      if (cancelled) return;
      const path = L.polyline(line, { color: "#E6AC00", weight: 5, opacity: 0.95 }).addTo(next);
      next.fitBounds(path.getBounds(), { padding: [28, 28] });
      window.setTimeout(() => next.invalidateSize(), 150);
      setNote(routed ? "Driving route on OpenStreetMap. Tap a dot for the city." : "OpenStreetMap. The router did not answer, so this is a straight line.");
    }

    void draw();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [origin, destination]);

  return (
    <section className={bare ? "h-full overflow-hidden bg-canvas" : "overflow-hidden rounded-3xl border border-line bg-paper"}>
      <div ref={host} className={bare ? "route-map h-full w-full bg-canvas" : "route-map h-56 w-full bg-canvas"} />
      {bare ? null : <p className="px-3 py-2 text-xs text-slate">{note}</p>}
    </section>
  );
}
