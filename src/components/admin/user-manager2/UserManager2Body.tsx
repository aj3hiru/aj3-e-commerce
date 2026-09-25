"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Gauge, Rss, Images, Bell, Store, Users as UsersIcon, Feather, BarChart3, Megaphone, Settings, FileText, Folder, Shield,
  UserRound, ShieldCheck, CheckCircle2, AlertCircle, X, Loader2, Pencil, Trash2, Plus, ChevronDown, ClipboardList, Truck, Check, Eye, EyeOff,
} from "lucide-react";
import { AvatarPicker } from "@/components/staff/AvatarPicker";
import { STAFF_ROLES, roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";
import { StatusPill, type PillOption } from "@/components/admin/ui/buttons";
import { PERMISSION_GROUPS, getRolePermissionDefaults, countGrantedPermissions, type PermissionsShape } from "@/lib/permissions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Gauge, Rss, Images, Bell, Store, Users: UsersIcon, Feather, BarChart3, Megaphone, Settings, FileText, Folder, Shield, ClipboardList, Truck,
};

export interface User2Row {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string; // "active" | "pending" | "suspended"
  permissions: PermissionsShape;
}

const roleColor = (id: string) => STAFF_ROLES.find((r) => r.id === id)?.color ?? "#64748b";
function RoleBadge({ role }: { role: string }) {
  const c = roleColor(role);
  return <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 11%, white)` }}>{roleLabel(role)}</span>;
}
const STATUS_OPTIONS: readonly PillOption<"active" | "pending" | "suspended">[] = [
  { value: "active", label: "Active", variant: "success" },
  { value: "pending", label: "Pending", variant: "warning" },
  { value: "suspended", label: "Suspended", variant: "danger" },
];

const EVT_ADD = "users2:add";
export function Users2AddButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVT_ADD))}
      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] bg-[#2563eb] px-4 text-[0.875rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]">
      <Plus className="h-4 w-4" /> Add User
    </button>
  );
}

const CARD = "rounded-xl border border-admin-gray-200 bg-white shadow-sm";
const TOTAL_PERMISSIONS = countGrantedPermissions(getRolePermissionDefaults("admin")); // every leaf = true when role is admin, so this is the full leaf count

export function UserManager2Body({ users: initial, currentUserId }: { users: User2Row[]; currentUserId: number }) {
  const router = useRouter();
  const { isVisible: show, loaded } = useDashboardWidgetPrefs();
  const [users, setUsers] = useState(initial);
  useEffect(() => setUsers(initial), [initial]);

  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [roleFilter, setRoleFilter] = useState("all");
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<User2Row | "new" | null>(null);
  const [confirm, setConfirm] = useState<User2Row | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    const onAdd = () => setEditing("new");
    window.addEventListener(EVT_ADD, onAdd);
    return () => window.removeEventListener(EVT_ADD, onAdd);
  }, []);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "admin").length,
    active: users.filter((u) => u.status === "active").length,
    suspended: users.filter((u) => u.status !== "active").length,
  }), [users]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (term && !`${u.username} ${u.email} ${u.firstName ?? ""} ${u.lastName ?? ""} ${u.phone ?? ""}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [users, roleFilter, q]);

  const markBusy = (id: number, on: boolean) => setBusy((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  async function setStatus(u: User2Row, status: "active" | "pending" | "suspended") {
    markBusy(u.id, true);
    const ok = await fetch(`/api/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
      .then(async (r) => r.ok && (await r.json().catch(() => ({}))).success === true).catch(() => false);
    markBusy(u.id, false);
    if (ok) { setUsers((l) => l.map((x) => (x.id === u.id ? { ...x, status } : x))); notify(true, `${u.username}'s status updated.`); router.refresh(); }
    else notify(false, "Couldn't update status. Please try again.");
  }

  async function remove(u: User2Row) {
    setConfirm(null);
    markBusy(u.id, true);
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => ({ success: false }));
    markBusy(u.id, false);
    if (res.success) { setUsers((l) => l.filter((x) => x.id !== u.id)); notify(true, `"${u.username}" deleted.`); router.refresh(); }
    else notify(false, res.message ?? "Couldn't delete this user.");
  }

  const td = "border border-[#dee2e6] px-3 py-3 align-middle";

  return (
    <div className={cn("mt-5 space-y-5", !loaded && "invisible")}>
      {show("u2-cards") && (
        <div className="grid grid-cols-2 gap-4 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr">
          {show("u2-k-total") && <StatCard icon={UsersIcon} tint="bg-blue-50 text-blue-600" value={stats.total} label="Total Users" />}
          {show("u2-k-admins") && <StatCard icon={ShieldCheck} tint="bg-violet-50 text-violet-600" value={stats.admins} label="Admins" />}
          {show("u2-k-active") && <StatCard icon={CheckCircle2} tint="bg-emerald-50 text-emerald-600" value={stats.active} label="Active" />}
          {show("u2-k-suspended") && <StatCard icon={UserRound} tint="bg-amber-50 text-amber-600" value={stats.suspended} label="Suspended / Pending" />}
        </div>
      )}

      {show("u2-table") && (
      <section className={cn(CARD, "p-5 sm:p-7")}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {show("u2-t-search") && (
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email…" aria-label="Search users"
              className="h-10 w-[240px] rounded-[0.375rem] border border-[#dee2e6] px-3 text-sm focus:border-[#86b7fe] focus:outline-none focus:ring-4 focus:ring-[#0d6efd]/15" />
          )}
          <label className="relative flex h-10 items-center gap-2 rounded-[0.375rem] border border-[#dee2e6] bg-white pl-3 pr-8 text-sm">
            <span className="text-admin-gray-500">Role:</span>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="appearance-none bg-transparent font-medium text-admin-gray-900 focus:outline-none">
              <option value="all">All</option>{STAFF_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-admin-gray-500" />
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-admin-gray-400">
            {users.length === 0 ? <>No users yet. <button type="button" onClick={() => setEditing("new")} className="font-semibold text-[#2563eb] hover:underline">Add your first user</button></> : "No users match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[15px]">
              <thead>
                <tr className="bg-[#f8f9fa] text-left">
                  {show("u2-c-user") && <th className={cn(td, "font-bold text-admin-gray-900")}>User</th>}
                  {show("u2-c-role") && <th className={cn(td, "font-bold text-admin-gray-900")}>Role</th>}
                  {show("u2-c-status") && <th className={cn(td, "font-bold text-admin-gray-900")}>Status</th>}
                  {show("u2-c-permissions") && <th className={cn(td, "font-bold text-admin-gray-900")}>Permissions</th>}
                  {show("u2-c-actions") && <th className={cn(td, "font-bold text-admin-gray-900")}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isBusy = busy.has(u.id);
                  const granted = countGrantedPermissions(u.permissions);
                  const isSelf = u.id === currentUserId;
                  return (
                    <tr key={u.id} className={cn("odd:bg-[#f2f2f2] even:bg-white", isBusy && "opacity-60")}>
                      {show("u2-c-user") && (
                        <td className={td}>
                          <div className="flex items-center gap-2.5">
                            {u.avatar
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={`/${u.avatar}`} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                              : <Avatar username={u.firstName || u.username} />}
                            <div className="min-w-0">
                              <button type="button" onClick={() => setEditing(u)} className="block truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}{isSelf && <span className="ml-1.5 text-xs font-normal text-admin-gray-400">(you)</span>}</button>
                              <div className="truncate text-xs text-admin-gray-400">@{u.username}{u.phone ? ` · ${u.phone}` : ""} · {u.email}</div>
                            </div>
                          </div>
                        </td>
                      )}
                      {show("u2-c-role") && <td className={td}><RoleBadge role={u.role} /></td>}
                      {show("u2-c-status") && (
                        <td className={td}>
                          <StatusPill label={`Change status of ${u.username}`} value={u.status === "active" ? "active" : u.status === "pending" ? "pending" : "suspended"}
                            options={STATUS_OPTIONS} disabled={isBusy || isSelf} onChange={(next) => setStatus(u, next)} />
                        </td>
                      )}
                      {show("u2-c-permissions") && <td className={cn(td, "text-admin-gray-600")}>{granted} / {TOTAL_PERMISSIONS} granted</td>}
                      {show("u2-c-actions") && (
                        <td className={td}>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={() => setEditing(u)} title={`Edit ${u.username}`} className="flex h-8 w-8 items-center justify-center rounded-[0.375rem] bg-[#eef2ff] text-[#2563eb] hover:bg-[#2563eb] hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                            <button type="button" disabled={isBusy || isSelf} title={isSelf ? "You can't delete your own account" : `Delete ${u.username}`} onClick={() => setConfirm(u)}
                              className="flex h-8 w-8 items-center justify-center rounded-[0.375rem] bg-red-50 text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {editing && (
        <UserModal user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(username, isNew) => { setEditing(null); notify(true, `"${username}" ${isNew ? "created" : "saved"}.`); router.refresh(); }}
          onDelete={editing === "new" || editing.id === currentUserId ? undefined : () => { const u = editing; setEditing(null); setConfirm(u); }}
        />
      )}
      {confirm && (
        createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirm(null)}>
            <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h5 className="mb-2 flex items-center gap-2 text-lg font-bold text-admin-gray-900"><Trash2 className="h-5 w-5 text-red-500" /> Delete &quot;{confirm.username}&quot;?</h5>
              <p className="text-sm text-admin-gray-600">This can&apos;t be undone. Their activity log entries stay, but they lose access immediately.</p>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirm(null)} className="h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-sm font-medium text-white hover:bg-[#5c636a]">Cancel</button>
                <button type="button" autoFocus onClick={() => remove(confirm)} className="h-10 rounded-[0.375rem] bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>, document.body
        )
      )}
      {toast && createPortal(
        <div role="status" className={cn("fixed bottom-5 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border px-4 py-3 text-sm shadow-lg", toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
          {toast.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="flex-1">{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>, document.body
      )}
    </div>
  );
}

function StatCard({ icon: Icon, tint, value, label }: { icon: React.ComponentType<{ className?: string }>; tint: string; value: number; label: string }) {
  return (
    <div className={cn(CARD, "flex items-center gap-4 px-5 py-4")}>
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", tint)}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0"><span className="block text-2xl font-bold leading-tight text-admin-gray-900">{value.toLocaleString("en-IN")}</span><span className="block text-sm text-admin-gray-600">{label}</span></span>
    </div>
  );
}

function Avatar({ username }: { username: string }) {
  const hue = (username.charCodeAt(0) * 47) % 360;
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: `hsl(${hue} 55% 48%)` }}>{username.slice(0, 1).toUpperCase()}</span>;
}

/* ───────────────────────── add/edit modal (Meesho style) ───────────────────────── */

const MI = "h-11 w-full rounded-[4px] border border-[#cfcedc] bg-white px-3 text-[15px] text-[#353543] outline-none transition placeholder:text-[#a7a9b6] focus:border-[#9f2089] focus:ring-2 focus:ring-[#9f2089]/15";
function MField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 flex justify-between text-[13px] font-medium text-[#616173]">{label}{hint && <span className="font-normal text-[#a7a9b6]">{hint}</span>}</span>{children}</label>;
}

function UserModal({ user, onClose, onSaved, onDelete }: {
  user: User2Row | null; onClose: () => void; onSaved: (username: string, isNew: boolean) => void; onDelete?: () => void;
}) {
  const [f, setF] = useState({
    firstName: user?.firstName ?? "", lastName: user?.lastName ?? "", phone: user?.phone ?? "", email: user?.email ?? "",
    username: user?.username ?? "", avatar: user?.avatar ?? "", password: "",
  });
  const [usernameTouched, setUsernameTouched] = useState(!!user);
  const [role, setRole] = useState<string>(user?.role ?? "delivery_agent");
  const [permissions, setPermissions] = useState<PermissionsShape>(user?.permissions ?? getRolePermissionDefaults("delivery_agent"));
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => {
    const n = { ...x, ...p };
    // Suggest a username from the name until one is typed.
    if (!usernameTouched && (p.firstName !== undefined || p.lastName !== undefined)) n.username = `${n.firstName}${n.lastName ? `.${n.lastName}` : ""}`.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30);
    return n;
  });

  function applyRole(next: string) {
    setRole(next);
    setPermissions(getRolePermissionDefaults(next)); // a new role starts from its preset; fine-tune below
  }
  const setGroup = (groupKey: keyof PermissionsShape, fields: string[], value: boolean) => setPermissions((prev) => ({
    ...prev, [groupKey]: Object.fromEntries(fields.map((k) => [k, value])),
  }) as PermissionsShape);
  function toggle(groupKey: keyof PermissionsShape, field: string | null, value: boolean) {
    setPermissions((prev) => {
      const next = { ...prev };
      if (field === null) (next as unknown as Record<string, boolean>)[groupKey as string] = value;
      else {
        const group = { ...(next[groupKey] as Record<string, boolean>) };
        group[field] = value;
        (next as unknown as Record<string, unknown>)[groupKey as string] = group;
      }
      return next;
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.firstName.trim()) { setErr({ text: "Enter the first name.", field: "firstName" }); return; }
    if (!f.username.trim() || !f.email.trim()) { setErr({ text: "Username and email are required.", field: "username" }); return; }
    if (f.phone && f.phone.length !== 10) { setErr({ text: "Enter a 10-digit mobile number.", field: "phone" }); return; }
    if (!user && f.password.length < 6) { setErr({ text: "Password must be at least 6 characters.", field: "password" }); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(user ? `/api/users/${user.id}` : "/api/users", {
        method: user ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, role, permissions, password: f.password || undefined }),
      });
      const data = await res.json();
      if (!data.success) { setErr({ text: data.message }); setBusy(false); return; }
      onSaved(f.username, !user);
    } catch { setErr({ text: "Could not reach the server. Please try again." }); setBusy(false); }
  }

  const bad = (k: string) => err?.field === k && "!border-red-400";
  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/50 font-storefront sm:items-center sm:p-4" onClick={() => !busy && onClose()} style={{ ["--hp-accent" as string]: "#9f2089" }}>
      <form onSubmit={save} role="dialog" aria-modal="true" className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white text-[#353543] shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#eaeaf2] px-5">
          <h5 className="text-[17px] font-semibold">{user ? "Edit Staff Member" : "Add Staff Member"}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-[#616173] hover:bg-[#f5f5f8]"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f5f5f8] px-4 py-4 sm:px-5">
          {err && <div role="alert" className="flex items-center gap-2 rounded-[6px] bg-[#fdecee] px-3 py-2.5 text-[13.5px] font-medium text-[#d0263a]"><AlertCircle className="h-4 w-4 shrink-0" />{err.text}</div>}

          <section className="rounded-xl bg-white p-4">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <AvatarPicker value={f.avatar} name={f.firstName || f.username} onChange={(avatar) => set({ avatar })} />
              <div className="grid w-full flex-1 gap-3 sm:grid-cols-2">
                <MField label="First name"><input autoFocus value={f.firstName} onChange={(e) => set({ firstName: e.target.value })} className={cn(MI, bad("firstName"))} /></MField>
                <MField label="Last name"><input value={f.lastName} onChange={(e) => set({ lastName: e.target.value })} className={MI} /></MField>
                <MField label="Mobile number" hint="Can log in with it">
                  <div className="flex"><span className="grid h-11 place-items-center rounded-l-[4px] border border-r-0 border-[#cfcedc] bg-[#f5f5f8] px-2.5 text-[14px] text-[#616173]">+91</span>
                    <input inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10 digits" className={cn(MI, "rounded-l-none", bad("phone"))} /></div>
                </MField>
                <MField label="Email"><input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} className={cn(MI, bad("username"))} /></MField>
                <MField label="Username" hint="For login"><input value={f.username} onChange={(e) => { setUsernameTouched(true); set({ username: e.target.value.replace(/\s/g, "") }); }} className={cn(MI, bad("username"))} /></MField>
                <MField label={user ? "New password" : "Password"} hint={user ? "Leave blank to keep" : "Min 6 characters"}>
                  <PasswordField value={f.password} onChange={(password) => set({ password })} invalid={err?.field === "password"} />
                </MField>
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-4">
            <p className="mb-1 text-[15px] font-semibold">Role</p>
            <p className="mb-3 text-[12.5px] text-[#8b8ba3]">Decides their dashboard and what they can do.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STAFF_ROLES.map((r) => {
                const on = role === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => applyRole(r.id)} aria-pressed={on}
                    className={cn("flex items-start gap-3 rounded-[8px] border px-3 py-2.5 text-left transition", on ? "border-[#9f2089] bg-[#9f2089]/[0.05]" : "border-[#e3e3ec] hover:border-[#b9b9c9]")}>
                    <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-[#9f2089]" : "border-[#b9b9c9]")}>{on && <span className="h-2.5 w-2.5 rounded-full bg-[#9f2089]" />}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[14px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-[#8b8ba3]">{r.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl bg-white">
            <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <ShieldCheck className="h-5 w-5 text-[#9f2089]" />
              <span className="flex-1"><span className="block text-[15px] font-semibold">Advanced permissions</span><span className="block text-[12px] text-[#8b8ba3]">{countGrantedPermissions(permissions)} of {TOTAL_PERMISSIONS} allowed — fine-tune what this person can do</span></span>
              <ChevronDown className={cn("h-5 w-5 text-[#a7a9b6] transition-transform", advanced && "rotate-180")} />
            </button>
            {advanced && (
              <div className="space-y-4 border-t border-[#eaeaf2] px-4 py-4">
                {PERMISSION_GROUPS.map((group) => {
                  const Icon = ICONS[group.icon];
                  const groupValue = permissions[group.key];
                  return (
                    <div key={group.key}>
                      <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
                        {Icon && <Icon className="h-4 w-4 text-[#9f2089]" />} {group.label}
                        {group.fields ? (
                          <span className="ml-auto flex gap-3 text-[12px] font-semibold">
                            <button type="button" onClick={() => setGroup(group.key, Object.keys(group.fields!), true)} className="text-[#9f2089]">All</button>
                            <button type="button" onClick={() => setGroup(group.key, Object.keys(group.fields!), false)} className="text-[#8b8ba3]">None</button>
                          </span>
                        ) : <input type="checkbox" className="ml-auto h-4 w-4 accent-[#9f2089]" checked={!!groupValue} onChange={(e) => toggle(group.key, null, e.target.checked)} />}
                      </div>
                      {group.fields && (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(group.fields).map(([field, label]) => {
                            const on = !!(groupValue as Record<string, boolean>)[field];
                            return (
                              <button key={field} type="button" onClick={() => toggle(group.key, field, !on)} aria-pressed={on}
                                className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] transition", on ? "border-[#9f2089] bg-[#9f2089]/[0.07] font-medium text-[#9f2089]" : "border-[#dcdce6] text-[#616173]")}>
                                {on && <Check className="h-3 w-3" strokeWidth={3} />}{label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-[#eaeaf2] bg-white px-4 py-3 sm:px-5">
          {onDelete && <button type="button" onClick={onDelete} disabled={busy} className="mr-auto flex h-11 items-center gap-1.5 rounded-[4px] px-3 text-[14px] font-medium text-[#d0263a] hover:bg-[#fdecee]"><Trash2 className="h-4 w-4" /> Delete</button>}
          <button type="button" onClick={onClose} disabled={busy} className={cn("h-11 rounded-[4px] border border-[#9f2089] bg-white px-5 text-[15px] font-medium text-[#9f2089]", !onDelete && "ml-auto")}>Cancel</button>
          <button type="submit" disabled={busy} className="flex h-11 items-center gap-2 rounded-[4px] bg-[#9f2089] px-6 text-[15px] font-medium text-white disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {user ? "Save Changes" : "Add Staff"}
          </button>
        </div>
      </form>
    </div>, document.body
  );
}

function PasswordField({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} className={cn(MI, "pr-11", invalid && "!border-red-400")} />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center text-[#8b8ba3]">
        {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}
