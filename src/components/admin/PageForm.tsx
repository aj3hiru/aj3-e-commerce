"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface PageFormValues {
  id?: number;
  title: string;
  slug: string;
  content: string;
  metaTitle: string;
  metaDescription: string;
  status: "draft" | "published";
}

export function PageForm({ initial }: { initial: PageFormValues | null }) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<PageFormValues>(
    initial ?? { title: "", slug: "", content: "", metaTitle: "", metaDescription: "", status: "published" }
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const url = isEdit ? `/api/pages/${initial!.id}` : "/api/pages";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Save failed.");
        return;
      }
      router.push(data.redirect);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">{error}</div>}

      <div className="bg-white rounded-lg border border-admin-gray-200 p-5 space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">Title *</label>
          <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Slug (leave blank to auto-generate)</label>
          <div className="flex items-center gap-1">
            <span className="text-admin-gray-400 text-sm">/</span>
            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="flex-1 border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Content *</label>
          <textarea
            required
            rows={14}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Write the page content here. Plain text or simple HTML both work — line breaks are preserved."
            className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Status</label>
          <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "draft" | "published" }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 p-5 space-y-3">
        <h5 className="font-bold text-sm">SEO (optional)</h5>
        <div>
          <label className="block text-xs font-medium mb-1">Meta Title</label>
          <input value={form.metaTitle} onChange={(e) => setForm((f) => ({ ...f, metaTitle: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" placeholder="Falls back to the page title if left blank" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Meta Description</label>
          <textarea rows={2} value={form.metaDescription} onChange={(e) => setForm((f) => ({ ...f, metaDescription: e.target.value }))} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>
      </div>

      <button type="submit" disabled={submitting} className="bg-admin-primary hover:bg-admin-primary-dark text-white font-semibold rounded-lg px-6 py-2.5 disabled:opacity-60">
        {submitting ? "Saving…" : isEdit ? "Update Page" : "Create Page"}
      </button>
    </form>
  );
}
