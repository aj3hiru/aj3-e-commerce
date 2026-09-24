"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, Copy, Download, Eye, EyeOff, KeyRound, Loader2, Lock, RefreshCw, Sparkles, Terminal, Truck, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInt } from "@/lib/format";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { BTN_OUTLINE, CARD, ConfirmDialog, INPUT, LABEL } from "./ui";

export interface SettingsData {
  configured: boolean; publicKey: string; subject: string; hasPrivateKey: boolean;
  publicFingerprint: string; privateFingerprint: string;
}

/** VAPID keys (stored in app_config). The private key never reaches the
 *  browser — only a fingerprint (a hash) is shown so admins can tell keys apart. */
export function SettingsTab({ settings, subscribers, onSaved, onError }: {
  settings: SettingsData; subscribers: number; onSaved: (text?: string) => void; onError: (text: string) => void;
}) {
  const { isVisible: show } = useDashboardWidgetPrefs();
  const [publicKey, setPublicKey] = useState(settings.publicKey);
  const [privateKey, setPrivateKey] = useState("");
  const [replacing, setReplacing] = useState(!settings.hasPrivateKey);
  const [subject, setSubject] = useState(settings.subject || "mailto:");
  const [showPrivate, setShowPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"generate" | "backup" | null>(null);

  // After a save / generate the page re-renders with new props — follow them.
  useEffect(() => {
    setPublicKey(settings.publicKey);
    setSubject(settings.subject || "mailto:");
    setPrivateKey("");
    setReplacing(!settings.hasPrivateKey);
  }, [settings.publicKey, settings.subject, settings.hasPrivateKey, settings.privateFingerprint]);

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
      if (data.success) onSaved("Push settings saved.");
      else { setErr(data.error ?? "Couldn't save settings."); onError(data.error ?? "Couldn't save settings."); }
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setConfirm(null);
    setBusy(true);
    setErr(null);
    const data = await fetch("/api/push2/settings/generate", { method: "POST" }).then((r) => r.json()).catch(() => ({ success: false }));
    setBusy(false);
    if (data.success) onSaved(`New keys generated (ID ${data.fingerprint}).`);
    else onError(data.error ?? "Couldn't generate keys.");
  }

  function copyPublic() {
    navigator.clipboard?.writeText(publicKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  return (
    <div className={cn("grid grid-cols-1 gap-5", show("pm2-st-form") && side && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
      {show("pm2-st-form") && (
        <form onSubmit={save} className={cn(CARD, "h-fit")}>
          <header className="flex flex-wrap items-center gap-2 border-b border-admin-gray-100 px-5 py-4">
            <KeyRound className="h-4 w-4 text-[#2563eb]" />
            <h2 className="text-base font-bold text-[#2563eb]">VAPID Keys</h2>
            <span className={cn("ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
              settings.configured ? "bg-[#d1e7dd] text-[#0f5132]" : "bg-[#fff3cd] text-[#856404]")}>
              {settings.configured ? <><CheckCircle2 className="h-3.5 w-3.5" /> Configured · {formatInt(subscribers)} subscribers</> : <><AlertTriangle className="h-3.5 w-3.5" /> Not configured</>}
            </span>
          </header>
          <div className="space-y-5 p-5">
            {!settings.configured && (
              <div className="flex flex-wrap items-center gap-3 rounded-[0.5rem] border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="flex-1">No keys yet. The quickest way: <b>Generate new keys</b> — one click, nothing to copy.</span>
                <button type="button" onClick={() => setConfirm("generate")} className="h-9 rounded-[0.375rem] bg-[#2563eb] px-3 text-sm font-semibold text-white hover:bg-[#1d4ed8]">Generate new keys</button>
              </div>
            )}
            {err && <div role="alert" className="flex items-start gap-2 rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><X className="mt-0.5 h-4 w-4 shrink-0" />{err}</div>}

            <div>
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="vapid-public" className={LABEL}>Public Key <span className="text-red-500">*</span></label>
                {settings.publicFingerprint && <span className="mb-1 font-mono text-[11px] text-admin-gray-400">ID {settings.publicFingerprint}</span>}
              </div>
              <div className="flex gap-2">
                <input id="vapid-public" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} required spellCheck={false} autoComplete="off"
                  placeholder="Starts with B… (about 87 characters)" className={cn(INPUT, "font-mono text-xs")} />
                <button type="button" onClick={copyPublic} disabled={!publicKey} title="Copy public key" aria-label="Copy public key" className={cn(BTN_OUTLINE, "w-10 shrink-0 px-0")}>
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-admin-gray-500">Not secret — browsers use it when a shopper taps &quot;Allow Notifications&quot;.</p>
            </div>

            <div>
              <div className="flex items-end justify-between gap-2">
                <label htmlFor="vapid-private" className={LABEL}>Private Key {!settings.hasPrivateKey && <span className="text-red-500">*</span>}</label>
                {settings.privateFingerprint && <span className="mb-1 font-mono text-[11px] text-admin-gray-400">ID {settings.privateFingerprint}</span>}
              </div>
              {!replacing ? (
                <div className="flex items-center gap-3 rounded-[0.375rem] border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-3 py-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Lock className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block select-none truncate font-mono text-sm tracking-[0.2em] text-admin-gray-500">••••••••••••••••••••••••••••••••••</span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Protected — saved on the server, never shown</span>
                  </span>
                  <button type="button" onClick={() => { setReplacing(true); setPrivateKey(""); }} className="h-8 shrink-0 rounded-[0.375rem] border border-[#dee2e6] bg-white px-3 text-xs font-semibold text-admin-gray-700 hover:bg-admin-gray-50">
                    Replace
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input id="vapid-private" type={showPrivate ? "text" : "password"} value={privateKey} onChange={(e) => setPrivateKey(e.target.value)}
                      required={!settings.hasPrivateKey} spellCheck={false} autoComplete="new-password" autoFocus={settings.hasPrivateKey}
                      placeholder="Paste the private key (about 43 characters)" className={cn(INPUT, "pr-10 font-mono text-xs")} />
                    <button type="button" onClick={() => setShowPrivate((s) => !s)} aria-label={showPrivate ? "Hide private key" : "Show private key"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-admin-gray-400 hover:text-admin-gray-700">
                      {showPrivate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {settings.hasPrivateKey && (
                    <button type="button" onClick={() => { setReplacing(false); setPrivateKey(""); }} className={cn(BTN_OUTLINE, "shrink-0")}>Cancel</button>
                  )}
                </div>
              )}
              <p className="mt-1 text-xs text-admin-gray-500">Secret — proves notifications really come from your store. Never share it.</p>
            </div>

            <div>
              <label htmlFor="vapid-subject" className={LABEL}>Contact (Subject) <span className="text-red-500">*</span></label>
              <input id="vapid-subject" value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="mailto:you@yourshop.com or https://yourshop.com" className={INPUT} />
              <p className="mt-1 text-xs text-admin-gray-500">Your email (<code>mailto:</code>) or website (<code>https://</code>) — push services use it if they need to reach you.</p>
            </div>

            {keysChanged && (
              <div className="flex items-start gap-2 rounded-[0.375rem] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Changing keys means the <b>{formatInt(subscribers)}</b> current subscriber{subscribers === 1 ? "" : "s"} stop receiving notifications until they visit the store again (they re-subscribe automatically).</span>
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
        <div className="space-y-5">
          {show("pm2-st-status") && (
            <section className={cn(CARD, "space-y-3 p-5")}>
              <h3 className="text-sm font-bold text-admin-gray-900">Key tools</h3>
              <button type="button" onClick={() => setConfirm("generate")} disabled={busy} className={cn(BTN_OUTLINE, "w-full justify-start")}>
                <RefreshCw className="h-4 w-4 text-[#2563eb]" /> Generate new keys
              </button>
              <button type="button" onClick={() => setConfirm("backup")} disabled={!settings.configured} className={cn(BTN_OUTLINE, "w-full justify-start")}>
                <Download className="h-4 w-4 text-[#2563eb]" /> Download key backup
              </button>
              <p className="text-xs text-admin-gray-500">Keep a backup before moving servers — without the same keys, imported subscribers can&apos;t be reached.</p>
            </section>
          )}
          {show("pm2-st-help") && <KeyGuide />}
        </div>
      )}

      {confirm === "generate" && (
        <ConfirmDialog icon={<RefreshCw className="h-6 w-6" />} tone={settings.configured ? "red" : "blue"} title="Generate new keys?"
          text={settings.configured
            ? <>This replaces your current keys. The <b>{formatInt(subscribers)}</b> current subscriber{subscribers === 1 ? "" : "s"} won&apos;t get notifications until they visit the store again. Download a backup first if unsure.</>
            : <>A new key pair will be created and saved. You can start collecting subscribers right away.</>}
          confirmLabel="Generate" onCancel={() => setConfirm(null)} onConfirm={generate} />
      )}
      {confirm === "backup" && (
        <ConfirmDialog icon={<Lock className="h-6 w-6" />} tone="blue" title="Download key backup?"
          text={<>The file contains your <b>private key</b>. Store it somewhere safe and never share it. This download is logged.</>}
          confirmLabel="Download" onCancel={() => setConfirm(null)}
          onConfirm={() => { setConfirm(null); window.location.href = "/api/push2/settings/backup"; }} />
      )}
    </div>
  );
}

/** Plain-language answer to "where do I get VAPID keys and where do they go?" */
function KeyGuide() {
  const [open, setOpen] = useState<number>(0);
  const items = [
    {
      icon: Sparkles, title: "First time setting up?",
      body: <ol className="list-decimal space-y-1 pl-4"><li>Click <b>Generate new keys</b> (Key tools above).</li><li>That&apos;s it — keys are saved and the store starts showing &quot;Allow Notifications&quot;.</li></ol>,
    },
    {
      icon: Truck, title: "Moving from another server / the old site?",
      body: (
        <ol className="list-decimal space-y-1 pl-4">
          <li>Get the old keys: on this panel use <b>Download key backup</b>; on the old PHP site they are <code>VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> in <code>includes/config.php</code>.</li>
          <li>Paste both here → <b>Save Settings</b>. (Mismatched keys are refused.)</li>
          <li>Then go to <b>Subscribers → Import</b> and upload the subscriber file.</li>
        </ol>
      ),
    },
    {
      icon: Terminal, title: "Prefer the command line?",
      body: <><p className="mb-1.5">On any computer with Node.js:</p><code className="block rounded bg-admin-gray-50 px-2.5 py-1.5 font-mono text-[11px] text-admin-gray-800">npx web-push generate-vapid-keys</code><p className="mt-1.5">Paste the two keys it prints into the form.</p></>,
    },
  ];
  return (
    <section className={cn(CARD, "p-5")}>
      <h3 className="mb-1 text-sm font-bold text-admin-gray-900">Where do I get VAPID keys?</h3>
      <p className="mb-3 text-xs text-admin-gray-500">A key pair that identifies your store to browsers. Subscribers belong to the keys they signed up with.</p>
      <div className="divide-y divide-admin-gray-100 rounded-[0.5rem] border border-admin-gray-200">
        {items.map((it, i) => (
          <div key={it.title}>
            <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-admin-gray-800 hover:bg-admin-gray-50">
              <it.icon className="h-4 w-4 shrink-0 text-[#2563eb]" /> <span className="flex-1">{it.title}</span>
              <span className={cn("text-admin-gray-400 transition-transform", open === i && "rotate-180")}>▾</span>
            </button>
            {open === i && <div className="px-3 pb-3 text-xs leading-relaxed text-admin-gray-600">{it.body}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
