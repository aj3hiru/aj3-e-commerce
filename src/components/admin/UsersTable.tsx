"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, Trash2, Plus, Search } from "lucide-react";
import { UserFormModal, type UserFormValues } from "./UserFormModal";
import { getRolePermissionDefaults } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  role: "admin" | "editor" | "author";
  status: string;
  permissions: UserFormValues["permissions"];
}

interface UsersTableProps {
  users: UserRow[];
  currentUserId: number;
  search: string;
  roleFilter: string;
}

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-violet-100 text-violet-700",
  editor: "bg-sky-100 text-sky-700",
  author: "bg-amber-100 text-amber-700",
};

export function UsersTable({ users, currentUserId, search, roleFilter }: UsersTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modalMode, setModalMode] = useState<"closed" | "create" | UserFormValues>("closed");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; username: string } | null>(null);
  const [searchInput, setSearchInput] = useState(search);
  const [busy, setBusy] = useState(false);

  function applyFilters(next: Partial<{ search: string; role: string }>) {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.search !== undefined) params.set("search", next.search);
    if (next.role !== undefined) params.set("role", next.role);
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  async function setStatus(id: number, status: string) {
    setBusy(true);
    try {
      await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.success) alert(data.message);
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-admin-gray-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters({ search: searchInput })}
              placeholder="Search users…"
              className="pl-8 pr-3 py-2 text-sm border border-admin-gray-200 rounded"
            />
          </div>
          <select value={roleFilter} onChange={(e) => applyFilters({ role: e.target.value })} className="border border-admin-gray-200 rounded px-3 py-2 text-sm">
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="author">Author</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setModalMode("create")}
          className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-3.5 py-2"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-admin-gray-200 bg-admin-gray-50 text-left">
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-admin-gray-100">
                  <td className="py-2.5 px-4 font-medium">{u.username}{u.id === currentUserId && <span className="ml-1.5 text-xs text-admin-gray-400">(You)</span>}</td>
                  <td className="py-2.5 px-4">{u.email}</td>
                  <td className="py-2.5 px-4"><span className={cn("text-xs font-semibold rounded px-2 py-1 capitalize", ROLE_STYLES[u.role])}>{u.role}</span></td>
                  <td className="py-2.5 px-4">
                    <select
                      value={u.status}
                      disabled={busy}
                      onChange={(e) => setStatus(u.id, e.target.value)}
                      className={cn(
                        "text-xs font-semibold rounded px-2 py-1.5 border-0",
                        u.status === "active" ? "bg-emerald-100 text-emerald-700" : u.status === "suspended" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      )}
                    >
                      <option value="active">Active</option>
                      <option value="pending">Pending</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModalMode({ id: u.id, username: u.username, email: u.email, role: u.role, permissions: u.permissions ?? getRolePermissionDefaults(u.role) })}
                        className="w-8 h-8 flex items-center justify-center bg-admin-primary-lighter text-admin-primary hover:bg-admin-primary hover:text-white rounded"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => setDeleteTarget({ id: u.id, username: u.username })}
                          className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode !== "closed" && <UserFormModal initial={modalMode === "create" ? null : modalMode} onClose={() => setModalMode("closed")} />}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <h5 className="font-bold mb-2">Confirm Delete?</h5>
            <p className="text-sm text-admin-gray-600 mb-4">
              You are going to delete &quot;<strong>{deleteTarget.username}</strong>&quot;. Do you want to delete it?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={busy} className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
