"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";

export interface CategoryFormValues {
  id?: number;
  name: string;
  slug: string;
  metaKeywords: string;
  metaDescription: string;
  serial: number;
  image: string | null;
}

interface CategoryFormModalProps {
  initial: CategoryFormValues | null; // null = create mode
  onClose: () => void;
}

/** Verified against the add/edit modal form in categories.php: name, slug (auto
 *  from name if left blank), image upload, meta keywords/description, display serial. */
export function CategoryFormModal({ initial, onClose }: CategoryFormModalProps) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [metaKeywords, setMetaKeywords] = useState(initial?.metaKeywords ?? "");
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? "");
  const [serial, setSerial] = useState(initial?.serial ?? 0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial?.image ? `/${initial.image}` : null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Category name is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const form = new FormData();
    form.set("name", name.trim());
    form.set("slug", slug.trim());
    form.set("meta_keywords", metaKeywords.trim());
    form.set("meta_description", metaDescription.trim());
    form.set("serial", String(serial));
    if (imageFile) form.set("image", imageFile);

    try {
      const url = isEdit ? `/api/ecommerce/categories/${initial!.id}` : "/api/ecommerce/categories";
      const res = await fetch(url, { method: isEdit ? "PATCH" : "POST", body: form });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Save failed.");
        return;
      }
      router.push(data.redirect || "/admin/ecommerce/categories");
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
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h5 className="font-bold text-lg mb-4">{isEdit ? "Edit Category" : "Add Category"}</h5>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label
            htmlFor="catImage"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-admin-gray-300 rounded-lg h-28 cursor-pointer overflow-hidden"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <>
                <ImagePlus className="w-6 h-6 text-admin-gray-400" />
                <span className="text-xs text-admin-gray-400">Upload image</span>
              </>
            )}
          </label>
          <input
            type="file"
            id="catImage"
            accept="image/*"
            className="hidden"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />

          <div>
            <label className="block text-xs font-medium mb-1">Serial (display order)</label>
            <input
              type="number"
              value={serial}
              onChange={(e) => setSerial(Number(e.target.value) || 0)}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Slug (leave blank to auto-generate)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Meta Keywords</label>
            <input
              type="text"
              placeholder="Comma separated keywords"
              value={metaKeywords}
              onChange={(e) => setMetaKeywords(e.target.value)}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Meta Description</label>
            <textarea
              rows={3}
              placeholder="Enter meta description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded bg-admin-gray-100 hover:bg-admin-gray-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded bg-admin-primary text-white hover:bg-admin-primary-dark disabled:opacity-60"
            >
              {submitting ? "Saving…" : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
