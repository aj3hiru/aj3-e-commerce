"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";

export interface BrandFormValues {
  id?: number;
  name: string;
  slug: string;
  isPopular: boolean;
  logo: string | null;
}

interface BrandFormModalProps {
  initial: BrandFormValues | null;
  onClose: () => void;
}

export function BrandFormModal({ initial, onClose }: BrandFormModalProps) {
  const router = useRouter();
  const isEdit = !!initial?.id;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [isPopular, setIsPopular] = useState(initial?.isPopular ?? false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial?.logo ? `/${initial.logo}` : null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Brand name is required.");
      return;
    }
    setSubmitting(true);
    setError("");

    const form = new FormData();
    form.set("name", name.trim());
    form.set("slug", slug.trim());
    form.set("is_popular", isPopular ? "1" : "0");
    if (logoFile) form.set("logo", logoFile);

    try {
      const url = isEdit ? `/api/ecommerce/brands/${initial!.id}` : "/api/ecommerce/brands";
      const res = await fetch(url, { method: isEdit ? "PATCH" : "POST", body: form });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Save failed.");
        return;
      }
      router.push(data.redirect);
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
      <div className="bg-white rounded-lg max-w-sm w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <h5 className="font-bold text-lg mb-4">{isEdit ? "Edit Brand" : "Add Brand"}</h5>
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-3">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="brandLogo" className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-admin-gray-300 rounded-lg h-24 cursor-pointer overflow-hidden">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full object-contain" />
            ) : (
              <>
                <ImagePlus className="w-5 h-5 text-admin-gray-400" />
                <span className="text-xs text-admin-gray-400">Upload logo</span>
              </>
            )}
          </label>
          <input type="file" id="brandLogo" accept="image/*" className="hidden" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />

          <div>
            <label className="block text-xs font-medium mb-1">Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Slug (leave blank to auto-generate)</label>
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} className="accent-admin-primary" />
            Show in &quot;Popular Brands&quot; on storefront
          </label>

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
