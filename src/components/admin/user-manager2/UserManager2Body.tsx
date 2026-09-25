"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Gauge, Rss, Images, Bell, Store, Users as UsersIcon, Feather, BarChart3, Megaphone, Settings, FileText, Folder, Shield,
  UserRound, ShieldCheck, CheckCircle2, AlertCircle, X, Loader2, Pencil, Trash2, Plus, ChevronDown, ClipboardList, Truck, Check,
} from "lucide-react";
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
  status: string; // "active" | "pending" | "suspended"
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
      if (term && !`${u.username} ${u.email}`.toLowerCase().includes(term)) return false;
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
                            <Avatar username={u.username} />
                            <div className="min-w-0">
                              <button type="button" onClick={() => setEditing(u)} className="block truncate font-medium text-admin-gray-900 hover:text-[#2563eb] hover:underline">{u.username}{isSelf && <span className="ml-1.5 text-xs font-normal text-admin-gray-400">(you)</span>}</button>
                              <div className="truncate text-xs text-admin-gray-400">{u.email}</div>
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

/* ───────────────────────── add/edit modal ───────────────────────── */

function UserModal({ user, onClose, onSaved, onDelete }: {
  user: User2Row | null; onClose: () => void; onSaved: (username: string, isNew: boolean) => void; onDelete?: () => void;
}) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>(user?.role ?? "order_manager");
  const [permissions, setPermissions] = useState<PermissionsShape>(user?.permissions ?? getRolePermissionDefaults("order_manager"));
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; field?: string } | null>(null);

  function applyRole(next: string) {
    setRole(next);
    setPermissions(getRolePermissionDefaults(next)); // a new role starts from its preset; fine-tune below
  }
  const setGroup = (groupKey: keyof PermissionsShape, fields: string[], value: boolean) => setPermissions((prev) => ({
    ...prev, [groupKey]: Object.fromEntries(fields.map((f) => [f, value])),
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
    if (!username.trim() || !email.trim()) { setErr({ text: "Username and email are required." }); return; }
    if (!user && password.length < 6) { setErr({ text: "Password must be at least 6 characters.", field: "password" }); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(user ? `/api/users/${user.id}` : "/api/users", {
        method: user ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, role, permissions, ...(password ? { password } : {}) }),
      });
      const data = await res.json();
      if (!data.success) { setErr({ text: data.message }); setBusy(false); return; }
      onSaved(username, !user);
    } catch { setErr({ text: "Could not reach the server. Please try again." }); setBusy(false); }
  }

  const inputCls = (bad: boolean) => cn("h-11 w-full rounded-[0.375rem] border px-3 text-[15px] outline-none transition-[border-color,box-shadow]",
    bad ? "border-red-400 focus:ring-4 focus:ring-red-100" : "border-[#dee2e6] focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/15");

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#dee2e6] bg-[#f8f9fa] px-6 py-4">
          <h5 className="text-xl font-semibold text-admin-gray-900">{user ? "Edit User" : "Add User"}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-500 hover:bg-admin-gray-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          {err && <div role="alert" className="rounded-[0.375rem] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err.text}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Username</label><input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls(false)} /></div>
            <div><label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls(false)} /></div>
          </div>
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">{user ? "New Password" : "Password"} <span className="text-sm font-normal text-admin-gray-500">{user ? "(leave blank to keep current)" : ""}</span></label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls(err?.field === "password")} />
          </div>
          <div>
            <label className="mb-1.5 block text-[15px] font-medium text-admin-gray-900">Role <span className="text-sm font-normal text-admin-gray-500">— sets their dashboard and default permissions</span></label>
            <div className="grid gap-2 sm:grid-cols-2">
              {STAFF_ROLES.map((r) => {
                const on = role === r.id;
                return (
                  <button key={r.id} type="button" onClick={() => applyRole(r.id)} aria-pressed={on}
                    className={cn("relative rounded-[0.5rem] border px-3 py-2.5 text-left transition", on ? "border-transparent ring-2" : "border-[#dee2e6] hover:border-admin-gray-400")}
                    style={on ? { ["--tw-ring-color" as string]: r.color, background: `color-mix(in srgb, ${r.color} 7%, white)` } : undefined}>
                    <span className="flex items-center gap-2 text-sm font-semibold text-admin-gray-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-admin-gray-500">{r.description}</span>
                    {on && <Check className="absolute right-2 top-2 h-4 w-4" style={{ color: r.color }} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm font-medium text-admin-gray-900">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" /> Advanced permissions (fine-tune what this user can do) <span className="font-normal text-admin-gray-500">· {countGrantedPermissions(permissions)} granted</span>
          </label>

          {advanced && (
            <div className="max-h-80 space-y-4 overflow-y-auto rounded-[0.5rem] border border-[#dee2e6] p-4">
              {PERMISSION_GROUPS.map((group) => {
                const Icon = ICONS[group.icon];
                const groupValue = permissions[group.key];
                return (
                  <div key={group.key}>
                    <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-admin-gray-900">
                      {Icon && <Icon className="h-4 w-4 text-[#2563eb]" />} {group.label}
                      {group.fields && (
                        <span className="ml-auto flex gap-2 text-xs font-medium">
                          <button type="button" onClick={() => setGroup(group.key, Object.keys(group.fields!), true)} className="text-[#2563eb] hover:underline">All</button>
                          <button type="button" onClick={() => setGroup(group.key, Object.keys(group.fields!), false)} className="text-admin-gray-500 hover:underline">None</button>
                        </span>
                      )}
                      {!group.fields && <input type="checkbox" className="ml-auto h-4 w-4 accent-[#2563eb]" checked={!!groupValue} onChange={(e) => toggle(group.key, null, e.target.checked)} />}
                    </div>
                    {group.fields && (
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pl-6 sm:grid-cols-3">
                        {Object.entries(group.fields).map(([field, label]) => (
                          <label key={field} className="flex items-center gap-1.5 text-xs text-admin-gray-700">
                            <input type="checkbox" checked={!!(groupValue as Record<string, boolean>)[field]} onChange={(e) => toggle(group.key, field, e.target.checked)} className="h-3.5 w-3.5 accent-[#2563eb]" /> {label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-[#dee2e6] px-6 py-4">
          {onDelete && <button type="button" onClick={onDelete} disabled={busy} className="mr-auto flex h-10 items-center gap-1.5 rounded-[0.375rem] px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>}
          <button type="button" onClick={onClose} disabled={busy} className={cn("h-10 rounded-[0.375rem] bg-[#6c757d] px-5 text-[15px] font-medium text-white hover:bg-[#5c636a]", !onDelete && "ml-auto")}>Cancel</button>
          <button type="submit" disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.375rem] bg-[#2563eb] px-5 text-[15px] font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {user ? "Save Changes" : "Add User"}
          </button>
        </div>
      </form>
    </div>, document.body
  );
}
