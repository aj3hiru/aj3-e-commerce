"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Round profile photo with upload / remove. `value` is an uploads/… path or "". */
export function AvatarPicker({ value, onChange, size = 88, name }: { value: string; onChange: (path: string) => void; size?: number; name?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function pick(f?: File) {
    if (!f) return;
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/users/avatar", { method: "POST", body: fd }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (res?.success) onChange(res.path); else setErr(res?.message || "Upload failed.");
  }
  const initial = (name ?? "").trim().charAt(0).toUpperCase();
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <button type="button" onClick={() => input.current?.click()} aria-label="Change profile photo"
          className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-white bg-[color-mix(in_srgb,var(--hp-accent,#9f2089)_12%,white)] text-[var(--hp-accent,#9f2089)] shadow-md">
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/${value}`} alt="" className="h-full w-full object-cover" />
            : initial ? <span className="font-bold" style={{ fontSize: size * 0.4 }}>{initial}</span> : <UserRound style={{ width: size * 0.45, height: size * 0.45 }} />}
          {busy && <span className="absolute inset-0 grid place-items-center rounded-full bg-white/70"><Loader2 className="h-6 w-6 animate-spin" /></span>}
        </button>
        <span className="pointer-events-none absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-[var(--hp-accent,#9f2089)] text-white shadow"><Camera className="h-4 w-4" /></span>
        {value && !busy && (
          <button type="button" onClick={() => onChange("")} aria-label="Remove photo" className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-[#616173] shadow ring-1 ring-[#eaeaf2]"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <span className={cn("text-[12px]", err ? "text-red-600" : "text-[#8b8ba3]")}>{err || (value ? "Tap to change" : "Add photo")}</span>
    </div>
  );
}
