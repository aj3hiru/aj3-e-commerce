"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Gauge, Rss, Images, Bell, Store, Users, Feather, BarChart3, Megaphone, Settings, FileText, Folder, Shield,
} from "lucide-react";
import { PERMISSION_GROUPS, getRolePermissionDefaults, type PermissionsShape } from "@/lib/permissions";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Gauge, Rss, Images, Bell, Store, Users, Feather, BarChart3, Megaphone, Settings, FileText, Folder, Shield,
};

export interface UserFormValues {
  id?: number;
  username: string;
  email: string;
  role: "admin" | "editor" | "author";
  permissions: PermissionsShape;
}

interface UserFormModalProps {
  initial: UserFormValues | null;
  onClose: () => void;
}

export function UserFormModal({ initial, onClose }: UserFormModalProps) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserFormValues["role"]>(initial?.role ?? "author");
  const [permissions, setPermissions] = useState<PermissionsShape>(initial?.permissions ?? getRolePermissionDefaults("author"));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function applyRolePreset(newRole: UserFormValues["role"]) {
    setRole(newRole);
    if (!showAdvanced) setPermissions(getRolePermissionDefaults(newRole));
  }

  function togglePermission(groupKey: keyof PermissionsShape, field: string | null, value: boolean) {
    setPermissions((prev) => {
      const next = { ...prev };
      if (field === null) {
        (next as unknown as Record<string, boolean>)[groupKey as string] = value;
      } else {
        const group = { ...(next[groupKey] as Record<string, boolean>) };
        group[field] = value;
        (next as unknown as Record<string, unknown>)[groupKey as string] = group;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !email.trim()) {
      setError("Username and email are required.");
      return;
    }
    if (!isEdit && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const url = isEdit ? `/api/users/${initial!.id}` : "/api/users";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password: password || undefined, role, permissions }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Save failed.");
        return;
      }
      router.push(data.redirect || "/admin/user-manager");
      router.refresh();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h5 className="font-bold text-lg mb-4">{isEdit ? "Edit User" : "Add User"}</h5>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Username *</label>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Email *</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">{isEdit ? "New Password (leave blank to keep current)" : "Password *"}</label>
            <input type="password" required={!isEdit} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Role</label>
            <select value={role} onChange={(e) => applyRolePreset(e.target.value as UserFormValues["role"])} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="author">Author</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} className="accent-admin-primary" />
            Advanced Access (customize individual permissions)
          </label>

          {showAdvanced && (
            <div className="border border-admin-gray-200 rounded-lg p-3 max-h-72 overflow-y-auto space-y-3">
              {PERMISSION_GROUPS.map((group) => {
                const Icon = ICONS[group.icon];
                const groupValue = permissions[group.key];
                return (
                  <div key={group.key}>
                    <div className="flex items-center gap-2 text-sm font-semibold mb-1.5">
                      {Icon && <Icon className="w-4 h-4 text-admin-primary" />}
                      {group.label}
                      {!group.fields && (
                        <input
                          type="checkbox"
                          className="ml-auto accent-admin-primary"
                          checked={!!groupValue}
                          onChange={(e) => togglePermission(group.key, null, e.target.checked)}
                        />
                      )}
                    </div>
                    {group.fields && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 pl-6">
                        {Object.entries(group.fields).map(([field, label]) => (
                          <label key={field} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={!!(groupValue as Record<string, boolean>)[field]}
                              onChange={(e) => togglePermission(group.key, field, e.target.checked)}
                              className="accent-admin-primary"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded bg-admin-primary text-white hover:bg-admin-primary-dark disabled:opacity-60">
              {submitting ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
