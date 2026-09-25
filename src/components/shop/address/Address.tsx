"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, Check, Crosshair, House, Loader2, MapPin, MapPinned, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AddressType, SavedAddress } from "@/lib/customer-addresses";

const nearText = (l: string) => (/^(near|opp\.?|opposite|behind|beside)\b/i.test(l) ? l : `Near ${l}`);
import { Field, Notice, btnOutline, btnPrimary, inputCls } from "@/components/shop/ui/Meesho";

const STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
const TYPES: { v: AddressType; label: string; icon: typeof House }[] = [{ v: "home", label: "Home", icon: House }, { v: "work", label: "Work", icon: Briefcase }, { v: "other", label: "Other", icon: MapPin }];
const matchState = (s: string) => STATES.find((x) => x.toLowerCase() === s.toLowerCase()) ?? s;

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/shop/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => null);
  if (!res?.success) throw new Error(res?.message || "Couldn't save — please try again.");
  return res as { addresses: SavedAddress[]; id?: number };
}

type Draft = Omit<SavedAddress, "id" | "isDefault"> & { id?: number; isDefault: boolean };
const blank = (name = "", phone = ""): Draft => ({ name, phone, pincode: "", state: "", city: "", house: "", area: "", landmark: "", type: "home", lat: null, lng: null, isDefault: false });

/** Add / edit an address in a bottom sheet: current location, pincode lookup, landmark, type. */
export function AddressForm({ initial, defaults, onSaved, onClose }: {
  initial?: SavedAddress | null; defaults?: { name?: string; phone?: string };
  onSaved: (list: SavedAddress[], id: number) => void; onClose: () => void;
}) {
  const [a, setA] = useState<Draft>(() => (initial ? { ...initial } : blank(defaults?.name, defaults?.phone?.replace(/^\+91\s?/, "").replace(/\s/g, ""))));
  const [areas, setAreas] = useState<string[]>([]);
  const [pinBusy, setPinBusy] = useState(false);
  const [loc, setLoc] = useState<{ busy: boolean; error: string; accuracy: number | null }>({ busy: false, error: "", accuracy: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // On by default: the delivery partner gets the exact spot (latitude / longitude) and can follow it on the map.
  const [share, setShare] = useState(initial ? initial.lat !== null : true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const set = (p: Partial<Draft>) => { setA((x) => ({ ...x, ...p })); setError(""); };
  const lastPin = useRef("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Pincode → city, state and the post-office localities as area suggestions (India Post's free API).
  useEffect(() => {
    if (!/^\d{6}$/.test(a.pincode) || lastPin.current === a.pincode) return;
    lastPin.current = a.pincode;
    setPinBusy(true);
    fetch(`https://api.postalpincode.in/pincode/${a.pincode}`).then((r) => r.json()).then((j) => {
      const po = j?.[0]?.PostOffice as { Name: string; District: string; State: string }[] | null;
      if (!po?.length) return;
      setAreas([...new Set(po.map((p) => p.Name))]);
      setA((x) => ({ ...x, city: x.city || po[0].District, state: x.state || matchState(po[0].State) }));
    }).catch(() => {}).finally(() => setPinBusy(false));
  }, [a.pincode]);

  function useLocation() {
    if (!navigator.geolocation) { setLoc({ busy: false, error: "Location isn't available on this device.", accuracy: null }); return; }
    setLoc({ busy: true, error: "", accuracy: null });
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = Math.round(pos.coords.latitude * 1e7) / 1e7, lng = Math.round(pos.coords.longitude * 1e7) / 1e7;
      setA((x) => ({ ...x, lat, lng }));
      setLoc({ busy: false, error: "", accuracy: Math.round(pos.coords.accuracy) });
      // Fill the address from the pinned spot (OpenStreetMap reverse geocoding).
      try {
        const j = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`).then((r) => r.json());
        const d = (j?.address ?? {}) as Record<string, string>;
        const area = [d.road, d.neighbourhood || d.suburb || d.quarter || d.village].filter(Boolean).join(", ");
        const pin = (d.postcode ?? "").replace(/\s/g, "");
        setA((x) => ({
          ...x,
          area: area || x.area,
          city: d.city || d.town || d.city_district || d.county || d.state_district || x.city,
          state: d.state ? matchState(d.state) : x.state,
          pincode: /^\d{6}$/.test(pin) ? pin : x.pincode,
          house: x.house || [d.house_number, d.building].filter(Boolean).join(", "),
        }));
      } catch { /* the pin is saved even if the lookup fails */ }
    }, (e) => {
      setLoc({ busy: false, accuracy: null, error: e.code === 1 ? "Location permission was denied. Allow it in your browser settings, or fill the address below." : "Couldn't get your location. Please try again or fill the address below." });
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  /** The exact spot for the delivery partner, without touching what was typed. */
  const pinOnly = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 1e7) / 1e7, lng: Math.round(p.coords.longitude * 1e7) / 1e7 }),
      () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSaving(true);
    try {
      let body = { ...a };
      if (!share) body = { ...body, lat: null, lng: null };
      else if (body.lat === null || body.lng === null) {
        const spot = await pinOnly();
        if (spot) { body = { ...body, ...spot }; setA((x) => ({ ...x, ...spot })); }
      }
      const res = await api({ action: "save", ...body });
      onSaved(res.addresses, res.id ?? a.id ?? 0);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save."); }
    setSaving(false);
  }

  const mapSrc = a.lat !== null && a.lng !== null
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${a.lng - 0.003},${a.lat - 0.002},${a.lng + 0.003},${a.lat + 0.002}&layer=mapnik&marker=${a.lat},${a.lng}`
    : null;

  // Rendered at the end of <body>: on checkout this sheet sits inside the checkout <form>, and a form
  // inside a form makes “Save Address” submit the checkout instead (the address never saved).
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/50 font-storefront text-[#353543] shop:items-center" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-white shop:rounded-2xl" aria-label="Address form">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#eaeaf2] px-4">
          <p className="text-[16px] font-semibold">{initial ? "Edit Address" : "Add Delivery Address"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full hover:bg-[#f5f5f8]"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <button type="button" onClick={useLocation} disabled={loc.busy}
            className="flex w-full items-center gap-3 rounded-[8px] border border-dashed border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_6%,white)] px-3.5 py-3 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--hp-accent)] text-white">
              {loc.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-[var(--hp-accent)]">{a.lat !== null ? "Update my current location" : "Tap to use my current location"}</span>
              <span className="block text-[12px] text-[#616173]">{loc.busy ? "Finding you…" : "Pins your exact spot so the delivery person reaches you easily"}</span>
            </span>
          </button>
          {loc.error && <Notice tone="error">{loc.error}</Notice>}
          {mapSrc && (
            <div className="overflow-hidden rounded-[8px] border border-[#eaeaf2]">
              <iframe title="Pinned location" src={mapSrc} className="h-40 w-full border-0" loading="lazy" />
              <p className="flex items-center gap-1.5 bg-[#e7f8ee] px-3 py-2 text-[12.5px] font-medium text-[#038d63]">
                <MapPinned className="h-4 w-4" />Location pinned{loc.accuracy !== null && ` (±${loc.accuracy} m)`} · {a.lat?.toFixed(5)}, {a.lng?.toFixed(5)}
                <button type="button" onClick={() => set({ lat: null, lng: null })} className="ml-auto font-semibold text-[#616173] underline">Remove</button>
              </p>
            </div>
          )}

          <p className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-[#8b8ba3]">Contact details</p>
          <Field label="Full Name"><input required value={a.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" className={cn(inputCls, "h-11")} /></Field>
          <Field label="Mobile Number">
            <div className="flex">
              <span className="grid h-11 place-items-center rounded-l-[4px] border border-r-0 border-[#cfcedc] bg-[#f5f5f8] px-3 text-[15px] text-[#616173]">+91</span>
              <input required inputMode="numeric" maxLength={10} value={a.phone.replace(/\D/g, "").slice(-10)} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                autoComplete="tel-national" placeholder="10-digit mobile number" className={cn(inputCls, "h-11 rounded-l-none")} />
            </div>
          </Field>

          <p className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-[#8b8ba3]">Address</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pincode" hint={pinBusy ? "Checking…" : undefined}>
              <input required inputMode="numeric" maxLength={6} value={a.pincode} onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} autoComplete="postal-code" placeholder="6 digits" className={cn(inputCls, "h-11")} />
            </Field>
            <Field label="City / District"><input required value={a.city} onChange={(e) => set({ city: e.target.value })} autoComplete="address-level2" className={cn(inputCls, "h-11")} /></Field>
          </div>
          <Field label="House No., Building Name"><input required value={a.house} onChange={(e) => set({ house: e.target.value })} autoComplete="address-line1" placeholder="e.g. 12B, Sai Residency" className={cn(inputCls, "h-11")} /></Field>
          <Field label="Road Name, Area, Colony">
            <input required list="area-list" value={a.area} onChange={(e) => set({ area: e.target.value })} autoComplete="address-line2" placeholder="e.g. MG Road, Lajpat Nagar" className={cn(inputCls, "h-11")} />
            <datalist id="area-list">{areas.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Nearby Landmark" hint="Optional"><input value={a.landmark} onChange={(e) => set({ landmark: e.target.value })} placeholder="e.g. Near City Hospital" className={cn(inputCls, "h-11")} /></Field>

          <div>
            <p className="mb-2 text-[13px] font-medium text-[#616173]">Save address as</p>
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button key={t.v} type="button" onClick={() => set({ type: t.v })} aria-pressed={a.type === t.v}
                  className={cn("flex h-9 items-center gap-1.5 rounded-full border px-4 text-[14px]",
                    a.type === t.v ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_8%,white)] font-medium text-[var(--hp-accent)]" : "border-[#dcdce6]")}>
                  <t.icon className="h-4 w-4" strokeWidth={1.8} />{t.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-[14px]">
            <input type="checkbox" checked={a.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} className="h-[18px] w-[18px] accent-[var(--hp-accent)]" />
            Make this my default address
          </label>
          <label className="flex items-start gap-2.5 rounded-[8px] bg-[#f5f7ff] px-3 py-2.5 text-[14px]">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--hp-accent)]" />
            <span>
              <span className="block font-medium">Share my exact location with the delivery partner</span>
              <span className="block text-[12.5px] text-[#616173]">They see your spot on the map and can follow the route to your door.</span>
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
        </div>

        <div className="shrink-0 border-t border-[#eaeaf2] px-4 py-3">
          <button type="submit" disabled={saving} className={cn(btnPrimary, "h-12 w-full")}>{saving ? <><Loader2 className="h-5 w-5 animate-spin" />Saving…</> : "Save Address"}</button>
        </div>
      </form>
    </div>,
    document.body
  );
}

/** One saved address as a card (text + type + pinned badge). */
export function AddressCard({ a, selected, children }: { a: SavedAddress; selected?: boolean; children?: React.ReactNode }) {
  const T = TYPES.find((t) => t.v === a.type) ?? TYPES[0];
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold">{a.name}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#f0f0f5] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#616173]"><T.icon className="h-3 w-3" />{T.label}</span>
        {a.isDefault && <span className="rounded-full bg-[color-mix(in_srgb,var(--hp-accent)_10%,white)] px-2 py-0.5 text-[11px] font-semibold text-[var(--hp-accent)]">Default</span>}
      </div>
      <p className={cn("mt-1 text-[13.5px] leading-5", selected ? "text-[#353543]" : "text-[#616173]")}>
        {a.house}, {a.area}{a.landmark && `, ${nearText(a.landmark)}`}, {a.city} - <b className="font-semibold">{a.pincode}</b>
      </p>
      <p className="mt-0.5 text-[13px] text-[#616173]">Mobile: {a.phone}</p>
      {a.lat !== null && <p className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#038d63]"><MapPinned className="h-3.5 w-3.5" />Location pinned</p>}
      {children}
    </div>
  );
}

/** Account page: saved addresses with add / edit / delete / set default. */
export function AddressBook({ initial, defaults }: { initial: SavedAddress[]; defaults: { name?: string; phone?: string } }) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<SavedAddress | null | "new">(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function act(action: "delete" | "default", id: number) {
    if (action === "delete" && !confirm("Delete this address?")) return;
    setBusy(id); setError("");
    try { setList((await api({ action, id })).addresses); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't update."); }
    setBusy(null);
  }

  return (
    <section id="addresses" className="mb-2 bg-white px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] font-semibold">Saved Addresses {list.length > 0 && <span className="font-normal text-[#8b8ba3]">({list.length})</span>}</h2>
        <button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1 text-[13px] font-bold uppercase text-[var(--hp-accent)]"><Plus className="h-4 w-4" strokeWidth={2.5} />Add new</button>
      </div>
      {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
      {list.length === 0 ? (
        <button type="button" onClick={() => setEditing("new")} className="flex w-full items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-[#dcdce6] py-5 text-[14px] font-medium text-[#616173]">
          <MapPin className="h-5 w-5 text-[var(--hp-accent)]" />Add your first delivery address
        </button>
      ) : (
        <ul className="space-y-2.5">
          {list.map((a) => (
            <li key={a.id} className={cn("rounded-[8px] border px-3.5 py-3 transition-opacity", a.isDefault ? "border-[var(--hp-accent)]" : "border-[#eaeaf2]", busy === a.id && "opacity-50")}>
              <AddressCard a={a}>
                <div className="mt-2.5 flex flex-wrap gap-4 text-[13px] font-semibold">
                  <button type="button" onClick={() => setEditing(a)} className="flex items-center gap-1 text-[var(--hp-accent)]"><Pencil className="h-3.5 w-3.5" />Edit</button>
                  {!a.isDefault && <button type="button" onClick={() => act("default", a.id)} className="flex items-center gap-1 text-[#616173]"><Check className="h-3.5 w-3.5" />Set as default</button>}
                  <button type="button" onClick={() => act("delete", a.id)} className="flex items-center gap-1 text-[#d0263a]"><Trash2 className="h-3.5 w-3.5" />Delete</button>
                </div>
              </AddressCard>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <AddressForm initial={editing === "new" ? null : editing} defaults={defaults}
          onSaved={(l) => { setList(l); setEditing(null); }} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

/** Checkout: pick a saved address (or add one). */
export function AddressPicker({ initial, defaults, value, onChange }: {
  initial: SavedAddress[]; defaults: { name?: string; phone?: string }; value: number | null; onChange: (id: number | null) => void;
}) {
  const [list, setList] = useState(initial);
  const [editing, setEditing] = useState<SavedAddress | null | "new">(null);
  useEffect(() => { if (value === null && list.length) onChange((list.find((a) => a.isDefault) ?? list[0]).id); }, [list, value, onChange]);

  return (
    <>
      {list.length === 0 ? (
        <button type="button" onClick={() => setEditing("new")} className={cn(btnOutline, "h-12 w-full border-dashed")}><Plus className="h-5 w-5" />Add Delivery Address</button>
      ) : (
        <div className="space-y-2.5">
          {list.map((a) => {
            const on = value === a.id;
            return (
              <label key={a.id} className={cn("flex cursor-pointer gap-3 rounded-[8px] border px-3.5 py-3 transition", on ? "border-[var(--hp-accent)] bg-[color-mix(in_srgb,var(--hp-accent)_5%,white)]" : "border-[#dcdce6]")}>
                <input type="radio" name="address" checked={on} onChange={() => onChange(a.id)} className="sr-only" />
                <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-[var(--hp-accent)]" : "border-[#b9b9c9]")}>{on && <span className="h-2.5 w-2.5 rounded-full bg-[var(--hp-accent)]" />}</span>
                <AddressCard a={a} selected={on}>
                  {on && <button type="button" onClick={(e) => { e.preventDefault(); setEditing(a); }} className="mt-2 block text-[13px] font-semibold text-[var(--hp-accent)]">Edit address</button>}
                </AddressCard>
              </label>
            );
          })}
          <button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1.5 py-1 text-[14px] font-semibold text-[var(--hp-accent)]"><Plus className="h-4 w-4" strokeWidth={2.5} />Add a new address</button>
        </div>
      )}
      {editing && (
        <AddressForm initial={editing === "new" ? null : editing} defaults={defaults}
          onSaved={(l, id) => { setList(l); setEditing(null); if (id) onChange(id); }} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
