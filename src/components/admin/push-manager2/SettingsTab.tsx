"use client";

import { useState } from "react";
import { AlertTriangle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { CARD, INPUT, LABEL } from "./ui";

export interface SettingsData { configured: boolean; publicKey: string; subject: string; hasPrivateKey: boolean }

/** VAPID keys (stored in app_config). The private key is never sent to the browser. */
export function SettingsTab({ settings, subscribers, onSaved, onError }: {
  settings: SettingsData; subscribers: number; onSaved: () => void; onError: (text: string) => void;
}) {
  const { isVisible: show } = useDashboardWidgetPrefs();
  const [publicKey, setPublicKey] = useState(settings.publicKey);
  const [privateKey, setPrivateKey] = useState("");
  const [subject, setSubject] = useState(settings.subject || "mailto:");
  const [showPrivate, setShowPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const keysChanged = settings.configured && (publicKey.trim() !== settings.publicKey || privateKey.trim() !== "");
  const side = show("pm2-st-status") || show("pm2-st-help");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/push2/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey, privateKey, subject }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) { setPrivateKey(""); onSaved(); }
      else { setErr(data.error ?? "Couldn't save settings."); onError(data.error ?? "Couldn't save settings."); }
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("grid grid-cols-1 gap-5", show("pm2-st-form") && side && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
      {show("pm2-st-form") && (
        <form onSubmit={save} className={CARD}>
          <header className="flex items-center gap-2 border-b border-admin-gray-100 px-5 py-4">
            <KeyRound className="h-4 w-4 text-[#2563eb]" />
            <h2 className="text-base font-bold text-[#2563eb]">VAPID Keys</h2>
          </header>
          <div className="space-y-4 p-5">
            {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div>
              <label htmlFor="vapid-public" className={LABEL}>Public Key <span className="text-red-500">*</span></label>
              <input id="vapid-public" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} required spellCheck={false} autoComplete="off"
                placeholder="Paste the public key (starts with B…)" className={cn(INPUT, "font-mono text-xs")} />
            </div>
            <div>
              <label htmlFor="vapid-private" className={LABEL}>Private Key {!settings.hasPrivateKey && <span className="text-red-500">*</span>}</label>
              <div className="relative">
                <input id="vapid-private" type={showPrivate ? "text" : "password"} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                  required={!settings.hasPrivateKey} spellCheck={false} autoComplete="new-password"
                  placeholder={settings.hasPrivateKey ? "•••••••••••• saved — leave blank to keep it" : "Paste the private key"}
                  className={cn(INPUT, "pr-10 font-mono text-xs")} />
                <button type="button" onClick={() => setShowPrivate((s) => !s)} aria-label={showPrivate ? "Hide private key" : "Show private key"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-admin-gray-400 hover:text-admin-gray-700">
                  {showPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-admin-gray-500">Stored on the server only — it is never sent back to this page.</p>
            </div>
            <div>
              <label htmlFor="vapid-subject" className={LABEL}>Subject <span className="text-red-500">*</span></label>
              <input id="vapid-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="mailto:contact@example.com" className={INPUT} />
              <p className="mt-1 text-xs text-admin-gray-500">A <code>mailto:</code> address or <code>https://</code> URL push services can contact you at.</p>
            </div>
            {keysChanged && (
              <div className="flex items-start gap-2 rounded-[0.375rem] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Changing keys means the <b>{formatInt(subscribers)}</b> existing subscriber{subscribers === 1 ? "" : "s"} can no longer receive notifications until they subscribe again (the store re-subscribes returning visitors automatically).</span>
              </div>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={busy}
                className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save Settings
              </button>
            </div>
          </div>
        </form>
      )}

      {side && (
        <aside className={cn(CARD, "h-fit space-y-4 p-5 text-sm")}>
          {show("pm2-st-status") && (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-admin-gray-800">Status</span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", settings.configured ? "bg-[#d1e7dd] text-[#0f5132]" : "bg-[#fff3cd] text-[#856404]")}>
                  {settings.configured ? "Configured" : "Not configured"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-admin-gray-600">Subscribers</span>
                <b className="text-admin-gray-900">{formatInt(subscribers)}</b>
              </div>
            </>
          )}
          {show("pm2-st-status") && show("pm2-st-help") && <hr className="border-admin-gray-100" />}
          {show("pm2-st-help") && (
            <div className="text-admin-gray-600">
              <p className="mb-2 font-semibold text-admin-gray-800">Need a key pair?</p>
              <p className="mb-2">Generate one on the server with:</p>
              <code className="block rounded-[0.375rem] bg-admin-gray-50 px-3 py-2 font-mono text-xs text-admin-gray-800">npx web-push generate-vapid-keys</code>
              <p className="mt-2">The public key must be the same one the storefront uses when visitors subscribe.</p>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
