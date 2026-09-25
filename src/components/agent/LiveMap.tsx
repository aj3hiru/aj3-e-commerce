"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2, LocateFixed, Navigation } from "lucide-react";

/* Leaflet (OpenStreetMap) from its CDN, loaded only on this page. */
const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";
type LatLng = [number, number];
interface LMap { setView: (c: LatLng, z: number) => LMap; fitBounds: (b: LatLng[], o?: object) => void; remove: () => void; invalidateSize: () => void }
interface LLayer { addTo: (m: LMap) => LLayer; setLatLng?: (c: LatLng) => void; setLatLngs?: (c: LatLng[]) => void; remove: () => void; bindTooltip?: (t: string, o?: object) => LLayer }
interface LeafletNS {
  map: (el: HTMLElement, o?: object) => LMap;
  tileLayer: (url: string, o?: object) => LLayer;
  marker: (c: LatLng, o?: object) => LLayer;
  circleMarker: (c: LatLng, o?: object) => LLayer;
  circle: (c: LatLng, o?: object) => LLayer;
  polyline: (c: LatLng[], o?: object) => LLayer;
  divIcon: (o: object) => unknown;
}
declare global { interface Window { L?: LeafletNS } }

function loadLeaflet(): Promise<LeafletNS> {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET}/leaflet.css"]`)) {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `${LEAFLET}/leaflet.css`; document.head.appendChild(css);
    }
    const s = document.createElement("script"); s.src = `${LEAFLET}/leaflet.js`; s.async = true;
    s.onload = () => (window.L ? resolve(window.L) : reject(new Error("Map failed to load")));
    s.onerror = () => reject(new Error("Map failed to load"));
    document.head.appendChild(s);
  });
}

const km = (a: LatLng, b: LatLng) => {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtKm = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`);

/**
 * The customer's pinned spot and the agent's live position, the road route
 * between them (with distance and time), and one tap to Google Maps for
 * turn-by-turn navigation. The agent's location stays on this device.
 */
export function LiveMap({ dest, addressText }: { dest: LatLng | null; addressText: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const me = useRef<{ dot: LLayer; ring: LLayer } | null>(null);
  const route = useRef<LLayer | null>(null);
  const lastRouted = useRef<{ at: number; from: LatLng } | null>(null);
  const [pos, setPos] = useState<{ c: LatLng; acc: number } | null>(null);
  const [info, setInfo] = useState<{ km: number; min: number | null } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [geo, setGeo] = useState<"waiting" | "on" | "denied" | "off">("waiting");
  const followed = useRef(false);

  // Map + destination marker.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      if (dest) {
        const icon = L.divIcon({ className: "", iconSize: [34, 42], iconAnchor: [17, 40], html: '<div style="width:34px;height:42px;display:grid;place-items:center"><svg viewBox="0 0 24 24" width="34" height="34" fill="#9f2089" stroke="#fff" stroke-width="1.5"><path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg></div>' });
        L.marker(dest, { icon }).addTo(m).bindTooltip?.("Customer", { direction: "top", offset: [0, -34] });
        m.setView(dest, 16);
      } else m.setView([22.5, 79], 5);
      map.current = m;
      setStatus("ready");
    }).catch(() => setStatus("error"));
    return () => { cancelled = true; map.current?.remove(); map.current = null; me.current = null; route.current = null; };
  }, [dest]);

  // Live position.
  useEffect(() => {
    if (!navigator.geolocation) { setGeo("off"); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setGeo("on"); setPos({ c: [p.coords.latitude, p.coords.longitude], acc: p.coords.accuracy }); },
      (e) => setGeo(e.code === 1 ? "denied" : "off"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Draw me, and the road route (refreshed when I've moved ~150 m, at most every 30 s).
  useEffect(() => {
    const L = window.L, m = map.current;
    if (!L || !m || !pos) return;
    if (!me.current) {
      me.current = {
        ring: L.circle(pos.c, { radius: pos.acc, color: "#3f64e5", weight: 1, fillOpacity: 0.08 }).addTo(m),
        dot: L.circleMarker(pos.c, { radius: 8, color: "#fff", weight: 3, fillColor: "#3f64e5", fillOpacity: 1 }).addTo(m),
      };
    } else { me.current.dot.setLatLng?.(pos.c); me.current.ring.setLatLng?.(pos.c); }
    if (!dest) { if (!followed.current) { m.setView(pos.c, 16); followed.current = true; } return; }
    const straight = km(pos.c, dest);
    setInfo((i) => ({ km: i?.min != null ? i.km : straight, min: i?.min ?? null }));
    if (!followed.current) { m.fitBounds([pos.c, dest], { padding: [50, 50] }); followed.current = true; }
    const last = lastRouted.current;
    if (last && Date.now() - last.at < 30_000 && km(last.from, pos.c) < 0.15) return;
    lastRouted.current = { at: Date.now(), from: pos.c };
    fetch(`https://router.project-osrm.org/route/v1/driving/${pos.c[1]},${pos.c[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`)
      .then((r) => r.json())
      .then((j) => {
        const rt = j?.routes?.[0];
        if (!rt) throw new Error("no route");
        const pts = (rt.geometry.coordinates as [number, number][]).map(([x, y]) => [y, x] as LatLng);
        route.current?.remove();
        route.current = L.polyline(pts, { color: "#9f2089", weight: 5, opacity: 0.85 }).addTo(m);
        setInfo({ km: rt.distance / 1000, min: Math.max(1, Math.round(rt.duration / 60)) });
      })
      .catch(() => {
        route.current?.remove();
        route.current = L.polyline([pos.c, dest], { color: "#9f2089", weight: 3, dashArray: "6 8" }).addTo(m);
        setInfo({ km: straight, min: null });
      });
  }, [pos, dest, status]); // status: draw the first fix once the map has loaded

  const destParam = dest ? `${dest[0]},${dest[1]}` : encodeURIComponent(addressText.replace(/\n/g, ", "));
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${destParam}${pos ? `&origin=${pos.c[0]},${pos.c[1]}` : ""}&travelmode=driving`;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#eaeaf2]">
      <div className="relative h-[260px] bg-[#eef0f5]">
        <div ref={box} className="absolute inset-0 z-0" />
        {status === "loading" && <div className="absolute inset-0 grid place-items-center text-[13px] text-[#8b8ba3]"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {status === "error" && <div className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-[#8b8ba3]">Map couldn&rsquo;t load — use Navigate below.</div>}
        {status === "ready" && (
          <div className="absolute right-2 top-2 z-[500] flex flex-col gap-2">
            <button type="button" aria-label="Show me and the customer" onClick={() => { if (map.current) { if (pos && dest) map.current.fitBounds([pos.c, dest], { padding: [50, 50] }); else if (pos) map.current.setView(pos.c, 16); else if (dest) map.current.setView(dest, 16); } }}
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#353543] shadow-md"><LocateFixed className="h-5 w-5" /></button>
          </div>
        )}
        {!dest && status === "ready" && <div className="absolute inset-x-2 bottom-2 z-[500] rounded-lg bg-white/95 px-3 py-2 text-[12.5px] text-[#c77700] shadow">The customer didn&rsquo;t pin a location — navigation uses the written address.</div>}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {info ? (
            <p className="text-[15px] font-bold">{fmtKm(info.km)} away{info.min !== null && <span className="font-medium text-[#616173]"> · about {info.min} min</span>}</p>
          ) : (
            <p className="text-[14px] font-medium text-[#616173]">{geo === "denied" ? "Allow location to see distance" : geo === "off" ? "Location unavailable" : dest ? "Finding your location…" : "Customer location"}</p>
          )}
          <p className="flex items-center gap-1 text-[12px] text-[#8b8ba3]">
            <Crosshair className="h-3 w-3" />{geo === "on" ? `Live · ±${Math.round(pos?.acc ?? 0)} m` : geo === "denied" ? "Location permission is off" : "Waiting for GPS"}
          </p>
        </div>
        <a href={navUrl} target="_blank" rel="noopener noreferrer" className="flex h-11 shrink-0 items-center gap-1.5 rounded-[6px] bg-[#1a73e8] px-4 text-[14px] font-semibold text-white shadow-sm active:bg-[#1765cc]">
          <Navigation className="h-4 w-4" fill="currentColor" />Navigate
        </a>
      </div>
    </div>
  );
}
