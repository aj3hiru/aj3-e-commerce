"use client";

import { useStoreOrigin } from "@/hooks/useStoreOrigin";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Info, FolderTree, IndianRupee, ImageIcon, Images, SlidersHorizontal, Barcode, Printer, Upload, X, Plus, Loader2,
  CheckCircle2, AlertCircle, ChevronDown, Save, RotateCcw, Link2, Pencil, ExternalLink, Scale, ListChecks,
} from "lucide-react";
import slugify from "slugify";
import { cn } from "@/lib/utils";
import { useDashboardWidgetPrefs } from "@/hooks/useDashboardWidgetPrefs";

/* ───────────────────────── types ───────────────────────── */

export interface AP2Option { id: number; name: string }
export interface AP2Sub { id: number; name: string; categoryId: number }
export interface AP2Tag { slug: string; label: string }
export interface AP2Gst { label: string; rate: number; isDefault: boolean }

export interface AP2Product {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
  hsnCode: string | null;
  barcode: string | null;
  description: string | null;
  categoryId: number | null;
  subcategoryId: number | null;
  brandId: number | null;
  unit: string | null;
  productType: string;
  price: number;
  salePrice: number | null;
  gstRate: number;
  stockQty: number | null;
  image: string | null;
  badgeTag: string;
  itemType: string;
  status: string;
  downloadLink: string | null;
  licenseKey: string | null;
  affiliateUrl: string | null;
  isCampaign: boolean;
  campaignPrice: number | null;
  showOnHome: boolean;
  gallery: { id: number; image: string }[];
  sizes: { label: string; mrp: number; price: number | null; stockQty: number | null; isDefault: boolean }[];
  specs: { name: string; value: string }[];
}

/** Editable rows (strings while typing). `k` is a stable React key. */
interface SizeRowS { k: number; label: string; mrp: string; price: string; stock: string; isDefault: boolean }
interface SpecRowS { k: number; name: string; value: string }
let rowKey = 0;
const newSize = (isDefault = false): SizeRowS => ({ k: ++rowKey, label: "", mrp: "", price: "", stock: "", isDefault });
const newSpec = (): SpecRowS => ({ k: ++rowKey, name: "", value: "" });
const sizeFilled = (z: SizeRowS) => !!(z.label.trim() || z.mrp.trim() || z.price.trim() || z.stock.trim());
type QuickKind = "brand" | "category" | "subcategory" | "item_type";

/** Preset units — same list as the current product form; "Custom…" allows any text. */
const UNIT_PRESETS = ["KG", "Gram", "Liter", "ml", "cm", "Meter", "Piece"];
const LIST_PATH = "/admin/ecommerce/products";
/** Four fields in one row; 2 × 2 while the form shares the screen with the side column on laptops (1280–1439px). */
const ROW4 = "grid items-start gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-2 min-[1440px]:grid-cols-4";
const FORM_ID = "add-product2-form";

const makeSlug = (s: string) => slugify(s, { lower: true, strict: true, trim: true });
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

interface State {
  name: string;
  slug: string;
  slugTouched: boolean;
  sku: string;
  hsn: string;
  barcode: string;
  description: string;
  categoryId: string;
  subcategoryId: string;
  brandId: string;
  unitChoice: string; // "" | preset | "custom"
  unitCustom: string;
  price: string;
  salePrice: string;
  stock: string;
  gst: string;
  downloadLink: string;
  licenseKey: string;
  affiliateUrl: string;
  status: "active" | "inactive";
  badge: string;
  itemType: string;
  showOnHome: boolean;
  isCampaign: boolean;
  campaignPrice: string;
}

function initialState(p: AP2Product | null, defaultGst: number): State {
  const unit = p?.unit ?? "";
  const preset = unit === "" || UNIT_PRESETS.includes(unit);
  return {
    name: p?.name ?? "",
    slug: p?.slug ?? "",
    slugTouched: !!p,
    sku: p?.sku ?? "",
    hsn: p?.hsnCode ?? "",
    barcode: p?.barcode ?? "",
    description: p?.description ?? "",
    categoryId: num(p?.categoryId),
    subcategoryId: num(p?.subcategoryId),
    brandId: num(p?.brandId),
    unitChoice: preset ? unit : "custom",
    unitCustom: preset ? "" : unit,
    price: num(p?.price),
    salePrice: num(p?.salePrice),
    stock: p ? num(p.stockQty ?? 0) : "0",
    gst: String(p ? p.gstRate : defaultGst),
    downloadLink: p?.downloadLink ?? "",
    licenseKey: p?.licenseKey ?? "",
    affiliateUrl: p?.affiliateUrl ?? "",
    status: p?.status === "inactive" ? "inactive" : "active",
    badge: p?.badgeTag ?? "none",
    itemType: p?.itemType ?? "normal",
    showOnHome: p?.showOnHome ?? false,
    isCampaign: p?.isCampaign ?? false,
    campaignPrice: num(p?.campaignPrice),
  };
}

/* ───────────────────────── form ───────────────────────── */

export function AddProduct2Form({ product, categories: initialCategories, subcategories: initialSubcategories, brands: initialBrands, badges, itemTypes: initialItemTypes, gstRates, listPath = LIST_PATH }: {
  product: AP2Product | null;
  categories: AP2Option[];
  subcategories: AP2Sub[];
  brands: AP2Option[];
  badges: AP2Tag[];
  itemTypes: AP2Tag[];
  gstRates: AP2Gst[];
  /** Where Cancel and a finished save go back to (defaults to All Products 2). */
  listPath?: string;
}) {
  const storeOrigin = useStoreOrigin();
  const router = useRouter();
  const { isVisible, loaded } = useDashboardWidgetPrefs();
  const editing = product !== null;
  const productType = product?.productType ?? "physical";
  const isPhysical = productType === "physical";

  const defaultGst = gstRates.find((g) => g.isDefault)?.rate ?? 0;
  const [s, setS] = useState<State>(() => initialState(product, defaultGst));
  const [brands, setBrands] = useState(initialBrands);
  const [categories, setCategories] = useState(initialCategories);
  const [subcategories, setSubcategories] = useState(initialSubcategories);
  // Sizes / Units and Specifications (always at least one blank row to type in).
  const [sizes, setSizes] = useState<SizeRowS[]>(() =>
    product?.sizes.length
      ? product.sizes.map((z) => ({ k: ++rowKey, label: z.label, mrp: String(z.mrp), price: num(z.price), stock: num(z.stockQty), isDefault: z.isDefault }))
      : [newSize(true)]
  );
  const [specs, setSpecs] = useState<SpecRowS[]>(() =>
    product?.specs.length ? product.specs.map((x) => ({ k: ++rowKey, name: x.name, value: x.value })) : [newSpec()]
  );
  const [itemTypes, setItemTypes] = useState(initialItemTypes);

  // Images
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [gallery, setGallery] = useState(product?.gallery ?? []);
  const [removedGallery, setRemovedGallery] = useState<number[]>([]);
  const [newGallery, setNewGallery] = useState<{ file: File; url: string }[]>([]);

  const [saving, setSaving] = useState<null | "save" | "another">(null);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [quickAdd, setQuickAdd] = useState<null | QuickKind>(null);
  const [barcodeCheck, setBarcodeCheck] = useState<{ state: "idle" | "checking" | "free" | "taken" | "error"; by?: { id: number; name: string } }>({ state: "idle" });

  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Field visibility: a group's checkbox hides all of its fields.
  const show = useCallback((group: string, key: string) => isVisible(group) && isVisible(key), [isVisible]);

  function set<K extends keyof State>(key: K, value: State[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    if (error?.field) setError(null);
  }

  // Slug follows the name until the user edits the slug themselves.
  function setName(v: string) {
    setS((prev) => ({ ...prev, name: v, slug: prev.slugTouched ? prev.slug : makeSlug(v) }));
    setDirty(true);
    if (error?.field === "name") setError(null);
  }

  const subsForCategory = useMemo(
    () => subcategories.filter((x) => String(x.categoryId) === s.categoryId),
    [subcategories, s.categoryId]
  );

  // Live barcode check (debounced). Blank = will be auto-created on save.
  useEffect(() => {
    const code = s.barcode.trim();
    if (!code || (editing && code === (product?.barcode ?? ""))) {
      setBarcodeCheck({ state: "idle" });
      return;
    }
    setBarcodeCheck({ state: "checking" });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ barcode: code, ...(editing ? { exclude: String(product!.id) } : {}) });
        const res = await fetch(`/api/ecommerce/products2/check-barcode?${qs}`, { signal: ctl.signal });
        const data = await res.json();
        if (!data.success) return setBarcodeCheck({ state: "error" });
        setBarcodeCheck(data.taken ? { state: "taken", by: data.taken } : { state: "free" });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setBarcodeCheck({ state: "error" });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [s.barcode, editing, product]);

  // New product: put the cursor in Product Name as soon as the form is shown
  // (autoFocus doesn't fire on a server-rendered page, and the form stays
  // hidden until the Display Options are read).
  useEffect(() => {
    if (loaded && !editing) nameRef.current?.focus();
  }, [loaded, editing]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Ctrl/Cmd + S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Free preview object URLs.
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  useEffect(() => () => newGallery.forEach((g) => URL.revokeObjectURL(g.url)), [newGallery]);

  function pickImage(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError({ message: "Please choose an image file (JPG, PNG, WebP…).", field: "image" });
    if (f.size > 5 * 1024 * 1024) return setError({ message: "The image is larger than 5 MB.", field: "image" });
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    setRemoveImage(false);
    setDirty(true);
  }

  function addGalleryFiles(files: FileList | null) {
    if (!files) return;
    const ok = [...files].filter((f) => f.type.startsWith("image/") && f.size <= 5 * 1024 * 1024);
    if (ok.length < files.length) setError({ message: "Some files were skipped — only images up to 5 MB can be added.", field: "gallery" });
    setNewGallery((g) => [...g, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    if (ok.length) setDirty(true);
  }

  const price = Number(s.price);
  const sale = Number(s.salePrice);
  const discount = s.salePrice !== "" && s.price !== "" && sale > 0 && sale < price ? Math.round(((price - sale) / price) * 100) : null;
  const saleError = s.salePrice !== "" && s.price !== "" && sale > 0 && sale >= price;

  const filledSizes = sizes.filter(sizeFilled);
  const hasSizes = filledSizes.length > 0;

  function updateSize(k: number, patch: Partial<SizeRowS>) {
    setSizes((rows) => rows.map((z) => (z.k === k ? { ...z, ...patch } : patch.isDefault ? { ...z, isDefault: false } : z)));
    setDirty(true);
    if (error?.field === "sizes") setError(null);
  }
  function removeSize(k: number) {
    setSizes((rows) => {
      const left = rows.filter((z) => z.k !== k);
      if (left.length === 0) return [newSize(true)];
      if (!left.some((z) => z.isDefault)) left[0] = { ...left[0], isDefault: true };
      return left;
    });
    setDirty(true);
  }
  function updateSpec(k: number, patch: Partial<SpecRowS>) {
    setSpecs((rows) => rows.map((x) => (x.k === k ? { ...x, ...patch } : x)));
    setDirty(true);
  }
  function removeSpec(k: number) {
    setSpecs((rows) => (rows.length === 1 ? [newSpec()] : rows.filter((x) => x.k !== k)));
    setDirty(true);
  }

  function validateSizes(): string | null {
    const seen = new Set<string>();
    for (const [i, z] of filledSizes.entries()) {
      const label = z.label.trim();
      if (!label) return `Size / Unit row ${i + 1}: enter the size, e.g. 500 g.`;
      const key = label.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return `Size / Unit “${label}” is added twice.`;
      seen.add(key);
      const mrp = Number(z.mrp);
      if (z.mrp.trim() === "" || !Number.isFinite(mrp) || mrp < 0) return `Size / Unit “${label}”: enter the MRP.`;
      if (z.price.trim() !== "" && (!Number.isFinite(Number(z.price)) || Number(z.price) < 0)) return `Size / Unit “${label}”: enter a valid selling price.`;
      if (z.price.trim() !== "" && Number(z.price) > mrp) return `Size / Unit “${label}”: selling price can't be more than the MRP.`;
      if (z.stock.trim() !== "" && (!Number.isInteger(Number(z.stock)) || Number(z.stock) < 0)) return `Size / Unit “${label}”: stock must be a whole number, 0 or more.`;
    }
    return null;
  }

  function validate(): { message: string; field: string } | null {
    if (!s.name.trim()) return { message: "Product name is required.", field: "name" };
    // With Sizes / Units the main price may be left empty (the default size's price is used).
    if (s.price === "" ? !hasSizes : !Number.isFinite(price) || price < 0) return { message: hasSizes ? "Enter a valid price." : "Enter a price, or add Sizes / Units below.", field: "price" };
    const sizeErr = validateSizes();
    if (sizeErr) return { message: sizeErr, field: "sizes" };
    if (saleError) return { message: "Sale price should be lower than the price (leave it empty for no sale).", field: "sale_price" };
    if (isPhysical && (s.stock !== "" && (!Number.isInteger(Number(s.stock)) || Number(s.stock) < 0))) return { message: "Stock must be a whole number, 0 or more.", field: "stock_qty" };
    if (s.unitChoice === "custom" && !s.unitCustom.trim()) return { message: "Type the custom unit, or pick one from the list.", field: "unit" };
    if (barcodeCheck.state === "taken") return { message: `This barcode is already used by “${barcodeCheck.by?.name}”.`, field: "barcode" };
    return null;
  }

  function focusField(field?: string) {
    if (!field) return;
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el?.matches("input,select,textarea") ? el : el?.querySelector<HTMLElement>("input,select,textarea"))?.focus({ preventScroll: true });
    });
  }

  function resetForAnother() {
    // Keep the choices people usually repeat (category, brand, unit, GST, tags, status).
    setS((prev) => ({
      ...initialState(null, defaultGst),
      categoryId: prev.categoryId, subcategoryId: prev.subcategoryId, brandId: prev.brandId,
      unitChoice: prev.unitChoice, unitCustom: prev.unitCustom, gst: prev.gst,
      badge: prev.badge, itemType: prev.itemType, status: prev.status,
    }));
    setImageFile(null);
    setImagePreview(null);
    setNewGallery([]);
    setSizes([newSize(true)]);
    setSpecs([newSpec()]);
    setBarcodeCheck({ state: "idle" });
    setDirty(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    nameRef.current?.focus();
  }

  async function submit(mode: "save" | "another") {
    if (saving) return;
    const v = validate();
    if (v) {
      setError(v);
      focusField(v.field);
      return;
    }
    setError(null);
    setSaving(mode);

    const fd = new FormData();
    fd.set("name", s.name.trim());
    fd.set("slug", s.slug.trim());
    fd.set("sku", s.sku);
    fd.set("hsn_code", s.hsn);
    fd.set("barcode", s.barcode);
    fd.set("description", s.description);
    fd.set("category_id", s.categoryId);
    fd.set("subcategory_id", s.subcategoryId);
    fd.set("brand_id", s.brandId);
    fd.set("unit", s.unitChoice === "custom" ? s.unitCustom.trim() : s.unitChoice);
    fd.set("product_type", productType);
    fd.set("price", s.price);
    fd.set("sale_price", s.salePrice);
    fd.set("stock_qty", s.stock);
    fd.set("gst_rate", s.gst);
    fd.set("download_link", s.downloadLink);
    fd.set("license_key", s.licenseKey);
    fd.set("affiliate_url", s.affiliateUrl);
    fd.set("status", s.status);
    fd.set("badge_tag", s.badge);
    fd.set("item_type", s.itemType);
    if (s.showOnHome) fd.set("show_on_home", "on");
    if (s.isCampaign) fd.set("is_campaign", "on");
    fd.set("campaign_price", s.campaignPrice);
    fd.set("sizes", JSON.stringify(filledSizes.map((z) => ({ label: z.label, mrp: z.mrp, price: z.price, stock: z.stock, isDefault: z.isDefault }))));
    fd.set("specs", JSON.stringify(specs.map((x) => ({ name: x.name, value: x.value }))));
    if (imageFile) fd.set("image", imageFile);
    if (removeImage) fd.set("remove_image", "1");
    newGallery.forEach((g) => fd.append("gallery_images", g.file));
    removedGallery.forEach((id) => fd.append("removed_gallery_ids", String(id)));

    try {
      const res = await fetch(editing ? `/api/ecommerce/products2/${product!.id}` : "/api/ecommerce/products2", {
        method: editing ? "PUT" : "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({ success: false, message: "Unexpected server response." }));
      if (!data.success) {
        setError({ message: data.message || "Could not save the product.", field: data.field });
        focusField(data.field);
        setSaving(null);
        return;
      }
      if (mode === "another") {
        setToast(`“${data.name}” created. Add the next product.`);
        resetForAnother();
        setSaving(null);
        router.refresh();
        return;
      }
      setDirty(false);
      router.push(`${listPath}?success=${editing ? "updated" : "created"}&name=${encodeURIComponent(data.name)}`);
    } catch {
      setError({ message: "Could not reach the server. Please try again." });
      setSaving(null);
    }
  }

  const unitValue = s.unitChoice === "custom" ? s.unitCustom : s.unitChoice;
  const currentImage = imagePreview ?? (removeImage ? null : product?.image ? `/${product.image}` : null);
  const fieldErr = (f: string) => error?.field === f;

  return (
    <form
      id={FORM_ID}
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit("save");
      }}
      className={cn("pb-24", !loaded && "invisible")}
    >
      {error && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-[0.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error.message}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── left column ── */}
        <div className="min-w-0 space-y-5">
          <Card icon={Info} title="Basic Info">
            <Field label="Product Name" required error={fieldErr("name")} field="name">
              <input
                ref={nameRef}
                value={s.name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aashirvaad Atta 5kg"
                maxLength={255}
                className={inputCls(fieldErr("name"))}
              />
            </Field>
            {show("ap2-basic", "ap2-slug") && (
              <Field label="Slug" hint="Made from the name automatically" field="slug">
                <div className="flex items-center gap-2">
                  <input
                    value={s.slug}
                    onChange={(e) => {
                      // Keep hyphens while typing; tidy up fully on blur.
                      const v = e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
                      setS((p) => ({ ...p, slug: v, slugTouched: v !== "" }));
                      setDirty(true);
                    }}
                    onBlur={() => setS((p) => ({ ...p, slug: makeSlug(p.slug), slugTouched: p.slug !== "" }))}
                    placeholder="auto-generated"
                    className={inputCls(false)}
                  />
                  {editing && (
                    <a href={`${storeOrigin}/product?slug=${encodeURIComponent(product!.slug)}`} target="_blank" rel="noreferrer" title="View in shop" className={cn(btnCls, "shrink-0")}>
                      <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">View in shop</span>
                    </a>
                  )}
                  {s.slugTouched && !editing && (
                    <button type="button" title="Make from the name again" onClick={() => setS((p) => ({ ...p, slug: makeSlug(p.name), slugTouched: false }))} className={iconBtnCls}>
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Field>
            )}
            {(show("ap2-basic", "ap2-sku") || show("ap2-basic", "ap2-hsn") || show("ap2-basic", "ap2-barcode")) && (
              // SKU · HSN Code · Barcode in one row.
              <div className="grid items-start gap-4 sm:grid-cols-3">
                {show("ap2-basic", "ap2-sku") && (
                  <Field label="SKU" field="sku">
                    <input value={s.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. SKU-00123" maxLength={100} className={inputCls(false)} />
                  </Field>
                )}
                {show("ap2-basic", "ap2-hsn") && (
                  <Field label="HSN Code" hint="For GST" field="hsn">
                    <input value={s.hsn} onChange={(e) => set("hsn", e.target.value)} placeholder="e.g. 1101" maxLength={20} className={inputCls(false)} />
                  </Field>
                )}
                {show("ap2-basic", "ap2-barcode") && (
                  <Field label="Barcode / QR Code" error={fieldErr("barcode")} field="barcode">
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-400" />
                        <input
                          value={s.barcode}
                          onChange={(e) => set("barcode", e.target.value)}
                          // Scanners press Enter after the code — don't let that submit the form.
                          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                          placeholder={editing ? "Scan or type" : "Scan or leave blank"}
                          autoComplete="off"
                          maxLength={100}
                          aria-label="Barcode"
                          className={cn(inputCls(fieldErr("barcode") || barcodeCheck.state === "taken"), "pl-9")}
                        />
                      </div>
                      {editing && product?.barcode && (
                        <a href={`/admin/ecommerce/barcode-print?ids=${product.id}`} target="_blank" rel="noreferrer" title="Print barcode" aria-label="Print barcode" className={iconBtnCls}>
                          <Printer className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <BarcodeStatus check={barcodeCheck} blank={!s.barcode.trim()} editing={editing} />
                  </Field>
                )}
              </div>
            )}
            {show("ap2-basic", "ap2-desc") && (
              <Field label="Description" field="description">
                <textarea value={s.description} onChange={(e) => set("description", e.target.value)} rows={5} placeholder="What should customers know about this product?" className={cn(inputCls(false), "h-auto py-2.5 leading-relaxed")} />
              </Field>
            )}
          </Card>

          <Card icon={IndianRupee} title={isPhysical ? "Pricing & Stock" : "Pricing"}>
            {/* Price · Sale Price · Stock · GST in one row (2 × 2 on narrower screens). */}
            <div className={ROW4}>
              <Field label="Price (₹)" required={!hasSizes} hint={hasSizes && s.price === "" ? "From default size" : undefined} field="price" error={fieldErr("price")}>
                <MoneyInput value={s.price} onChange={(v) => set("price", v)} error={fieldErr("price")} />
              </Field>
              {show("ap2-price", "ap2-sale") && (
                <Field label="Sale Price (₹)" field="sale_price" error={fieldErr("sale_price") || saleError}
                  hint={saleError ? "Must be lower than the price" : discount !== null ? `${discount}% off` : "Optional"} hintGood={discount !== null && !saleError}>
                  <MoneyInput value={s.salePrice} onChange={(v) => set("salePrice", v)} error={fieldErr("sale_price") || saleError} />
                </Field>
              )}
              {isPhysical && show("ap2-price", "ap2-stock") && (
                <Field label={`Stock Quantity${unitValue ? ` (${unitValue})` : ""}`} field="stock_qty" error={fieldErr("stock_qty")}
                  hint={s.stock !== "" && Number(s.stock) === 0 ? "Out of stock" : undefined}>
                  <input type="number" min={0} step={1} inputMode="numeric" value={s.stock} onChange={(e) => set("stock", e.target.value)} className={inputCls(fieldErr("stock_qty"))} />
                </Field>
              )}
              {show("ap2-price", "ap2-gst") && (
                <Field label="GST Rate" hint="Auto in bills" field="gst_rate" error={fieldErr("gst_rate")}>
                  <SelectBox value={s.gst} onChange={(v) => set("gst", v)}>
                    {gstRates.length === 0 && <option value="0">0%</option>}
                    {/* Keep a saved rate selectable even if it was removed from GST settings. */}
                    {!gstRates.some((g) => String(g.rate) === s.gst) && gstRates.length > 0 && <option value={s.gst}>{s.gst}% (current)</option>}
                    {gstRates.map((g) => (
                      <option key={`${g.label}-${g.rate}`} value={String(g.rate)}>
                        {g.label}{g.label.includes("%") ? "" : ` (${g.rate}%)`}{g.isDefault ? " · Default" : ""}
                      </option>
                    ))}
                  </SelectBox>
                </Field>
              )}
            </div>
            {/* Fields for non-physical products (only reachable when editing one). */}
            {productType === "digital" && (
              <Field label="Download Link" field="download_link">
                <input type="url" value={s.downloadLink} onChange={(e) => set("downloadLink", e.target.value)} placeholder="https://…" className={inputCls(false)} />
              </Field>
            )}
            {productType === "license" && (
              <Field label="License Key(s)" hint="One key per line" field="license_key">
                <textarea value={s.licenseKey} onChange={(e) => set("licenseKey", e.target.value)} rows={3} className={cn(inputCls(false), "h-auto py-2.5")} />
              </Field>
            )}
            {productType === "affiliate" && (
              <Field label="Affiliate URL" field="affiliate_url">
                <input type="url" value={s.affiliateUrl} onChange={(e) => set("affiliateUrl", e.target.value)} placeholder="https://…" className={inputCls(false)} />
              </Field>
            )}
          </Card>
          {isVisible("ap2-cat") && (show("ap2-cat", "ap2-category") || show("ap2-cat", "ap2-brand") || show("ap2-cat", "ap2-unit")) && (
            <Card icon={FolderTree} title="Categorization">
              {/* Category · Sub Category · Brand · Unit in one row (2 × 2 on narrower screens). */}
              <div className={ROW4}>
                {show("ap2-cat", "ap2-category") && (
                  <Field label="Category" field="category_id" error={fieldErr("category_id")}>
                    <SelectBox
                      value={s.categoryId}
                      onChange={(v) => (v === "__add__" ? setQuickAdd("category") : setS((p) => ({ ...p, categoryId: v, subcategoryId: "" })))}
                      onDirty={() => setDirty(true)}
                    >
                      <option value="">Select category…</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {show("ap2-quick", "ap2-q-category") && <option value="__add__">+ Add new category…</option>}
                    </SelectBox>
                  </Field>
                )}
                {show("ap2-cat", "ap2-category") && show("ap2-cat", "ap2-subcategory") && (
                  <Field label="Sub Category" field="subcategory_id">
                    <SelectBox value={s.subcategoryId} onChange={(v) => (v === "__add__" ? setQuickAdd("subcategory") : set("subcategoryId", v))} disabled={!s.categoryId}>
                      <option value="">{!s.categoryId ? "Select category first…" : subsForCategory.length === 0 ? "No sub categories yet" : "Select sub category…"}</option>
                      {subsForCategory.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      {s.categoryId && show("ap2-quick", "ap2-q-subcategory") && <option value="__add__">+ Add new sub category…</option>}
                    </SelectBox>
                  </Field>
                )}
                {show("ap2-cat", "ap2-brand") && (
                  <Field label="Brand" field="brand_id" error={fieldErr("brand_id")}>
                    <SelectBox
                      value={s.brandId}
                      onChange={(v) => (v === "__add__" ? setQuickAdd("brand") : set("brandId", v))}
                    >
                      <option value="">Select brand…</option>
                      {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      {show("ap2-quick", "ap2-q-brand") && <option value="__add__">+ Add new brand…</option>}
                    </SelectBox>
                  </Field>
                )}
                {show("ap2-cat", "ap2-unit") && (
                  <Field label="Unit" hint="How it's sold" field="unit" error={fieldErr("unit")}>
                    {/* "Custom…" swaps the list for a text box (× goes back to the list), so the row stays one line. */}
                    {s.unitChoice === "custom" ? (
                      <div className="relative">
                        <input value={s.unitCustom} onChange={(e) => set("unitCustom", e.target.value)} placeholder="Type unit, e.g. Dozen" maxLength={30} autoFocus aria-label="Custom unit" className={cn(inputCls(fieldErr("unit")), "pr-9")} />
                        <button type="button" onClick={() => setS((p) => ({ ...p, unitChoice: "", unitCustom: "" }))} title="Back to the unit list" aria-label="Back to the unit list" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-admin-gray-400 hover:bg-admin-gray-100 hover:text-admin-gray-700">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <SelectBox value={s.unitChoice} onChange={(v) => set("unitChoice", v)}>
                        <option value="">No unit</option>
                        {UNIT_PRESETS.map((u) => <option key={u} value={u}>{u}</option>)}
                        <option value="custom">Custom…</option>
                      </SelectBox>
                    )}
                  </Field>
                )}
              </div>
            </Card>
          )}


          {isVisible("ap2-sizes") && (() => {
            // Columns follow Display Options (Selling Price / Stock / Default can be hidden;
            // hidden values are kept and saved unchanged).
            const def = isVisible("ap2-sz-default"), sp = isVisible("ap2-sz-price"), st = isVisible("ap2-sz-stock");
            const mdCols = [def && "28px", "minmax(0,1.3fr)", "minmax(0,1fr)", sp && "minmax(0,1fr)", st && "minmax(0,0.8fr)", "40px"].filter(Boolean).join(" ");
            const smCols = [def && "28px", "minmax(0,1fr)", "40px"].filter(Boolean).join(" ");
            const subCols = `repeat(${1 + (sp ? 1 : 0) + (st ? 1 : 0)},minmax(0,1fr))`;
            const vars = { "--md": mdCols, "--sm": smCols, "--sub": subCols } as React.CSSProperties;
            return (
              <Card icon={Scale} title="Sizes / Units" note="(optional)">
                {isVisible("ap2-sz-help") && (
                  <p className="-mt-1 text-[13px] text-admin-gray-500">Sell in multiple sizes (e.g. 500 g, 1 Kg), each with its own MRP and price. Leave empty for a single-price product.</p>
                )}
                <div data-field="sizes" className="space-y-2.5" style={vars}>
                  <div className="hidden gap-2.5 px-0.5 text-xs font-medium text-admin-gray-500 md:grid md:grid-cols-[var(--md)]">
                    {def && <span title="Default size — shown first in the shop">Def.</span>}
                    <span>Size / Unit</span><span>MRP ₹</span>{sp && <span>Selling Price ₹</span>}{st && <span>Stock</span>}<span />
                  </div>
                  {sizes.map((z, i) => {
                    const off = z.price !== "" && z.mrp !== "" && Number(z.price) < Number(z.mrp) && Number(z.mrp) > 0
                      ? Math.round(((Number(z.mrp) - Number(z.price)) / Number(z.mrp)) * 100) : null;
                    return (
                      <div key={z.k} className="grid grid-cols-[var(--sm)] items-center gap-2.5 md:grid-cols-[var(--md)]">
                        {def && (
                          <label className="flex h-10 cursor-pointer items-center justify-center" title="Default size — shown first in the shop">
                            <input
                              type="radio"
                              name="default_size"
                              checked={z.isDefault}
                              onChange={() => updateSize(z.k, { isDefault: true })}
                              aria-label={`Make ${z.label || `row ${i + 1}`} the default size`}
                              className="h-4 w-4 accent-admin-primary"
                            />
                          </label>
                        )}
                        <input value={z.label} onChange={(e) => updateSize(z.k, { label: e.target.value })} placeholder="e.g. 500 g" maxLength={50} aria-label={`Size ${i + 1}`} className={inputCls(false)} />
                        <button type="button" onClick={() => removeSize(z.k)} aria-label={`Remove size ${i + 1}`} title="Remove" className={cn(iconBtnCls, "border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 md:order-last")}>
                          <X className="h-4 w-4" />
                        </button>
                        <div className={cn("col-span-full grid grid-cols-[var(--sub)] gap-2.5 md:contents", def && "pl-[38px]")}>
                          <MoneyInput value={z.mrp} onChange={(v) => updateSize(z.k, { mrp: v })} placeholder="MRP" ariaLabel={`MRP for size ${i + 1}`} />
                          {sp && (
                            <div className="relative">
                              <MoneyInput value={z.price} onChange={(v) => updateSize(z.k, { price: v })} placeholder="Selling (opt.)" ariaLabel={`Selling price for size ${i + 1}`}
                                error={z.price !== "" && z.mrp !== "" && Number(z.price) > Number(z.mrp)} />
                              {off !== null && <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded bg-emerald-50 px-1.5 text-[11px] font-semibold text-emerald-600 min-[1100px]:block">{off}% off</span>}
                            </div>
                          )}
                          {st && (
                            <input type="number" min={0} step={1} inputMode="numeric" value={z.stock} onChange={(e) => updateSize(z.k, { stock: e.target.value })} placeholder="Stock (opt.)" aria-label={`Stock for size ${i + 1}`} className={inputCls(false)} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => { setSizes((rows) => [...rows, newSize(rows.length === 0)]); setDirty(true); }} className={outlineBtnCls}>
                  <Plus className="h-4 w-4" /> Add Size / Unit
                </button>
              </Card>
            );
          })()}

          {isVisible("ap2-specs") && (
            <Card icon={ListChecks} title="Specifications" note="(optional)">
              {isVisible("ap2-sp-help") && (
                <p className="-mt-1 text-[13px] text-admin-gray-500">Shown as a list on the product page, e.g. Material: Cotton. Only filled rows are saved.</p>
              )}
              <div data-field="specs" className="space-y-2.5">
                {specs.map((x, i) => (
                  <div key={x.k} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_40px]">
                    <input value={x.name} onChange={(e) => updateSpec(x.k, { name: e.target.value })} placeholder="e.g. Material" maxLength={100} aria-label={`Specification ${i + 1} name`} className={inputCls(false)} />
                    <button type="button" onClick={() => removeSpec(x.k)} aria-label={`Remove specification ${i + 1}`} title="Remove" className={cn(iconBtnCls, "border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 sm:order-last")}>
                      <X className="h-4 w-4" />
                    </button>
                    <input value={x.value} onChange={(e) => updateSpec(x.k, { value: e.target.value })} placeholder="e.g. Cotton" maxLength={255} aria-label={`Specification ${i + 1} value`} className={cn(inputCls(false), "col-span-2 sm:col-span-1")} />
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setSpecs((rows) => [...rows, newSpec()]); setDirty(true); }} className={outlineBtnCls}>
                <Plus className="h-4 w-4" /> Add Specification
              </button>
            </Card>
          )}
        </div>

        {/* ── right column ── */}
        <div className="min-w-0 space-y-5">
          {isVisible("ap2-media") && (show("ap2-media", "ap2-image") || show("ap2-media", "ap2-gallery")) && (
            // Featured (main) image on top, gallery right under it — as in EduMint.
            <Card icon={ImageIcon} title="Product Images">
              {show("ap2-media", "ap2-image") && (
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-[13px] font-medium text-admin-gray-800">Featured Image</span>
                    <span className="text-xs text-admin-gray-400">Main photo shown everywhere</span>
                  </div>
                  <div data-field="image">
                    <DropZone onFile={pickImage}>
                      {(open) =>
                        currentImage ? (
                          <div className="group relative h-[220px] overflow-hidden rounded-[0.5rem] border border-[#e5e7eb] bg-admin-gray-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={currentImage} alt="Product" className="h-full w-full object-contain" />
                            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                              <button type="button" onClick={open} className="flex h-8 items-center gap-1.5 rounded-[0.5rem] bg-white px-3 text-xs font-medium text-admin-gray-800 shadow"><Pencil className="h-3.5 w-3.5" /> Change</button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (imageFile) {
                                    setImageFile(null);
                                    setImagePreview(null);
                                  } else setRemoveImage(true);
                                  setDirty(true);
                                }}
                                className="flex h-8 items-center gap-1.5 rounded-[0.5rem] bg-white px-3 text-xs font-medium text-red-600 shadow"
                              >
                                <X className="h-3.5 w-3.5" /> Remove
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={open} className="flex h-[220px] w-full flex-col items-center justify-center gap-2 rounded-[0.5rem] border-2 border-dashed border-admin-gray-200 bg-admin-gray-50/60 text-admin-gray-500 transition-colors hover:border-admin-primary hover:text-admin-primary">
                            <Upload className="h-6 w-6" />
                            <span className="text-sm font-medium">Click or drop an image</span>
                            <span className="text-xs text-admin-gray-400">JPG, PNG, WebP · up to 5 MB</span>
                          </button>
                        )
                      }
                    </DropZone>
                    {removeImage && product?.image && (
                      <button type="button" onClick={() => setRemoveImage(false)} className="mt-2 text-xs text-admin-primary hover:underline">Undo remove</button>
                    )}
                  </div>
                </div>
              )}
              {show("ap2-media", "ap2-gallery") && (
                <div className={cn(show("ap2-media", "ap2-image") && "border-t border-admin-gray-100 pt-4")}>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-admin-gray-800"><Images className="h-3.5 w-3.5 text-admin-gray-400" /> Gallery</span>
                    <span className="text-xs text-admin-gray-400">{gallery.length + newGallery.length} photo{gallery.length + newGallery.length === 1 ? "" : "s"} · more views of the item</span>
                  </div>
                  <div data-field="gallery" className="flex flex-wrap gap-2">
                    {gallery.map((g) => (
                      <Thumb key={g.id} src={`/${g.image}`} onRemove={() => {
                        setGallery((list) => list.filter((x) => x.id !== g.id));
                        setRemovedGallery((ids) => [...ids, g.id]);
                        setDirty(true);
                      }} />
                    ))}
                    {newGallery.map((g, i) => (
                      <Thumb key={g.url} src={g.url} isNew onRemove={() => setNewGallery((list) => list.filter((_, j) => j !== i))} />
                    ))}
                    <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-[0.5rem] border-2 border-dashed border-admin-gray-200 text-admin-gray-400 transition-colors hover:border-admin-primary hover:text-admin-primary" title="Add photos">
                      <Plus className="h-5 w-5" />
                      <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addGalleryFiles(e.target.files); e.target.value = ""; }} aria-label="Add gallery photos" />
                    </label>
                  </div>
                  {removedGallery.length > 0 && <p className="mt-2 text-xs text-admin-gray-500">{removedGallery.length} photo{removedGallery.length === 1 ? "" : "s"} will be removed when you save.</p>}
                </div>
              )}
            </Card>
          )}

          {isVisible("ap2-org") && (
            <Card icon={SlidersHorizontal} title="Organization">
              {show("ap2-org", "ap2-status") && (
                <Field label="Status" field="status">
                  <div className="grid grid-cols-2 rounded-[0.5rem] border border-[#e5e7eb] p-1">
                    {(["active", "inactive"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={s.status === v}
                        onClick={() => set("status", v)}
                        className={cn(
                          "flex h-8 items-center justify-center gap-2 rounded-[0.375rem] text-[13px] font-medium transition-colors",
                          s.status === v ? "bg-admin-primary text-white shadow-sm" : "text-admin-gray-600 hover:bg-admin-gray-50"
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", v === "active" ? "bg-emerald-400" : "bg-admin-gray-400")} />
                        {v === "active" ? "Published" : "Unpublished"}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              {show("ap2-org", "ap2-badge") && (
                <Field label="Badge Tag" hint="Optional" field="badge_tag">
                  <SelectBox value={s.badge} onChange={(v) => set("badge", v)}>
                    <option value="none">None</option>
                    {badges.filter((b) => b.slug !== "none").map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
                    {s.badge !== "none" && !badges.some((b) => b.slug === s.badge) && <option value={s.badge}>{s.badge}</option>}
                  </SelectBox>
                </Field>
              )}
              {show("ap2-org", "ap2-itemtype") && (
                <Field label="Item Type" hint="Optional" field="item_type">
                  <SelectBox value={s.itemType} onChange={(v) => (v === "__add__" ? setQuickAdd("item_type") : set("itemType", v))}>
                    <option value="normal">Normal</option>
                    {itemTypes.filter((t) => t.slug !== "normal").map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
                    {s.itemType !== "normal" && !itemTypes.some((t) => t.slug === s.itemType) && <option value={s.itemType}>{s.itemType}</option>}
                    {show("ap2-quick", "ap2-q-itemtype") && <option value="__add__">+ Add new item type…</option>}
                  </SelectBox>
                </Field>
              )}
              {show("ap2-org", "ap2-home") && (
                <Toggle label="Show on home page" hint="Feature this product on the shop's home page." checked={s.showOnHome} onChange={(v) => set("showOnHome", v)} />
              )}
              {show("ap2-org", "ap2-campaign") && (
                <>
                  <Toggle label="Campaign product" hint="Include in the current campaign offer." checked={s.isCampaign} onChange={(v) => set("isCampaign", v)} />
                  {s.isCampaign && (
                    <Field label="Campaign Price (₹)" hint="Optional" field="campaign_price" error={fieldErr("campaign_price")}>
                      <MoneyInput value={s.campaignPrice} onChange={(v) => set("campaignPrice", v)} error={fieldErr("campaign_price")} />
                    </Field>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* ── sticky save bar ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-admin-gray-200 bg-white/95 backdrop-blur lg:left-[280px]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="hidden text-[13px] text-admin-gray-500 sm:block">
            {dirty ? <span className="text-amber-600">● Unsaved changes</span> : editing ? "No changes yet" : "Fill in the details and save"}
            <span className="ml-3 hidden text-admin-gray-400 md:inline">Ctrl + S to save</span>
          </span>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
            <Link href={listPath} className={btnCls}>Cancel</Link>
            {!editing && (
              <button type="button" disabled={!!saving} onClick={() => submit("another")} className={cn(btnCls, "disabled:opacity-60")}>
                {saving === "another" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="hidden sm:inline">Save &amp; add another</span><span className="sm:hidden">Save + new</span>
              </button>
            )}
            <button type="submit" disabled={!!saving} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-admin-primary px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-admin-primary-dark disabled:opacity-60">
              {saving === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="whitespace-nowrap">{editing ? "Update" : "Create"}<span className="hidden sm:inline"> Product</span></span>
            </button>
          </div>
        </div>
      </div>

      {quickAdd && (
        <QuickAddModal
          kind={quickAdd}
          category={categories.find((c) => String(c.id) === s.categoryId) ?? null}
          onClose={() => setQuickAdd(null)}
          onAdded={(opt) => {
            const kind = quickAdd;
            const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
            if (kind === "brand") {
              setBrands((list) => (list.some((b) => b.id === opt.id) ? list : [...list, { id: opt.id!, name: opt.name }].sort(byName)));
              set("brandId", String(opt.id));
            } else if (kind === "category") {
              setCategories((list) => (list.some((c) => c.id === opt.id) ? list : [...list, { id: opt.id!, name: opt.name }].sort(byName)));
              setS((p) => ({ ...p, categoryId: String(opt.id), subcategoryId: "" }));
              setDirty(true);
            } else if (kind === "subcategory") {
              setSubcategories((list) => (list.some((c) => c.id === opt.id) ? list : [...list, { id: opt.id!, name: opt.name, categoryId: opt.categoryId! }].sort(byName)));
              set("subcategoryId", String(opt.id));
            } else {
              setItemTypes((list) => (list.some((t) => t.slug === opt.slug) ? list : [...list, { slug: opt.slug!, label: opt.name }]));
              set("itemType", opt.slug!);
            }
            setQuickAdd(null);
            setToast(`${QUICK_LABEL[kind]} “${opt.name}” ${opt.existed ? "already existed — selected" : "added"}.`);
          }}
        />
      )}
      {toast && (
        <div role="status" className="fixed bottom-20 right-5 z-[2100] flex max-w-md items-start gap-3 rounded-[0.5rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
        </div>
      )}
    </form>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

const inputCls = (err: boolean) =>
  cn(
    "h-10 w-full rounded-[0.5rem] border bg-white px-3 text-sm text-admin-gray-900 outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] disabled:bg-admin-gray-50 disabled:text-admin-gray-400",
    err ? "border-red-400 focus:shadow-[0_0_0_3px_#fee2e2]" : "border-[#e5e7eb] focus:border-admin-primary focus:shadow-[0_0_0_3px_#f5f3ff]"
  );
const btnCls =
  "flex h-10 items-center gap-2 whitespace-nowrap rounded-[0.5rem] border border-[#e5e7eb] bg-white px-3.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]";
const outlineBtnCls =
  "flex h-9 items-center gap-1.5 rounded-[0.5rem] border border-admin-primary/40 bg-white px-3 text-[13px] font-medium text-admin-primary transition-colors hover:bg-admin-primary-lighter";
const iconBtnCls = "flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.5rem] border border-[#e5e7eb] bg-white text-admin-gray-500 hover:bg-[#f9fafb] hover:text-admin-primary";

function Card({ icon: Icon, title, note, aside, children }: { icon: React.ComponentType<{ className?: string }>; title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-admin-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-2.5 border-b border-admin-gray-100 px-5 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-[0.5rem] bg-admin-primary-lighter text-admin-primary">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="flex-1 text-[15px] font-semibold text-admin-gray-900">
          {title}
          {note && <span className="ml-1.5 text-[13px] font-normal text-admin-gray-400">{note}</span>}
        </h2>
        {aside}
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, hintGood, required, error, field, children }: {
  label: string; hint?: string; hintGood?: boolean; required?: boolean; error?: boolean; field: string; children: React.ReactNode;
}) {
  return (
    <div data-field={field} className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="shrink-0 whitespace-nowrap text-[13px] font-medium text-admin-gray-800">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        {hint && <span title={hint} className={cn("min-w-0 truncate text-xs", error ? "text-red-600" : hintGood ? "font-medium text-emerald-600" : "text-admin-gray-400")}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SelectBox({ value, onChange, disabled, className, onDirty, children }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; onDirty?: () => void; children: React.ReactNode;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          onDirty?.();
        }}
        className={cn(inputCls(false), "cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed")}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-gray-500" />
    </div>
  );
}

function MoneyInput({ value, onChange, error, placeholder = "0.00", ariaLabel }: { value: string; onChange: (v: string) => void; error?: boolean; placeholder?: string; ariaLabel?: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-admin-gray-400">₹</span>
      <input
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onWheel={(e) => (e.target as HTMLInputElement).blur()}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(inputCls(!!error), "pl-7")}
      />
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-[13px] font-medium text-admin-gray-800">{label}</span>
        {hint && <span className="block text-xs text-admin-gray-400">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" aria-label={label} />
        <span className="h-5 w-9 rounded-full bg-admin-gray-200 transition-colors peer-checked:bg-admin-primary peer-focus-visible:ring-2 peer-focus-visible:ring-admin-primary/30" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function BarcodeStatus({ check, blank, editing }: { check: { state: string; by?: { id: number; name: string } }; blank: boolean; editing: boolean }) {
  if (blank) {
    return <p className="mt-1.5 text-xs text-admin-gray-400">{editing ? "Blank keeps the current barcode." : "Blank = auto barcode (EM00000123)."}</p>;
  }
  if (check.state === "checking") return <p className="mt-1.5 flex items-center gap-1.5 text-xs text-admin-gray-500"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</p>;
  if (check.state === "free") return <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Barcode is available</p>;
  if (check.state === "taken" && check.by) {
    return (
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-red-600">
        <AlertCircle className="h-3.5 w-3.5" /> Already used by “{check.by.name}”.
        <Link href={`/admin/ecommerce/products/add?edit=${check.by.id}`} className="inline-flex items-center gap-1 font-medium underline"><Link2 className="h-3 w-3" /> Open it</Link>
      </p>
    );
  }
  return null;
}

function DropZone({ onFile, children }: { onFile: (f: File | null) => void; children: (open: () => void) => React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={cn("rounded-[0.5rem]", over && "ring-2 ring-admin-primary ring-offset-2")}
    >
      {children(() => input.current?.click())}
      <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Choose product image" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
    </div>
  );
}

function Thumb({ src, isNew, onRemove }: { src: string; isNew?: boolean; onRemove: () => void }) {
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-[0.5rem] border border-admin-gray-200 bg-admin-gray-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
      {isNew && <span className="absolute bottom-0.5 left-0.5 rounded bg-admin-primary px-1 text-[9px] font-semibold text-white">NEW</span>}
      <button type="button" onClick={onRemove} aria-label="Remove photo" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

const QUICK_LABEL: Record<QuickKind, string> = { brand: "Brand", category: "Category", subcategory: "Sub Category", item_type: "Item Type" };
const QUICK_PLACEHOLDER: Record<QuickKind, string> = { brand: "e.g. Aashirvaad", category: "e.g. Grocery", subcategory: "e.g. Atta & Flours", item_type: "e.g. Combo Pack" };

/** "+ Add new…" pop-up for brand (with optional logo), category, sub-category and item type. */
function QuickAddModal({ kind, category, onClose, onAdded }: {
  kind: QuickKind;
  category: AP2Option | null;
  onClose: () => void;
  onAdded: (o: { id?: number; slug?: string; name: string; categoryId?: number; existed?: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!logo) return setLogoUrl(null);
    const u = URL.createObjectURL(logo);
    setLogoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [logo]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const what = QUICK_LABEL[kind];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save() {
    if (!name.trim()) return setErr(`Please enter a ${what.toLowerCase()} name.`);
    if (kind === "subcategory" && !category) return setErr("Choose a category first.");
    if (logo && (!logo.type.startsWith("image/") || logo.size > 2 * 1024 * 1024)) return setErr(`The ${kind === "brand" ? "logo" : "image"} must be an image up to 2 MB.`);
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("name", name.trim());
    if (kind === "subcategory" && category) fd.set("category_id", String(category.id));
    if (kind === "brand" && logo) fd.set("logo", logo);
    if (kind === "category" && logo) fd.set("image", logo);
    try {
      const res = await fetch("/api/ecommerce/products2/quick-add", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({ success: false }));
      if (!data.success) {
        setErr(data.message || `Could not add the ${what.toLowerCase()}.`);
        setBusy(false);
        return;
      }
      onAdded({ id: data.id, slug: data.slug, name: data.name, categoryId: data.categoryId, existed: data.existed });
    } catch {
      setErr("Could not reach the server. Please try again.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Add New ${what}`} className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-admin-gray-100 bg-admin-gray-50/70 px-5 py-4">
          <h5 className="text-base font-bold text-admin-gray-900">Add New {what}</h5>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded p-1 text-admin-gray-400 hover:bg-admin-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-5">
          {kind === "subcategory" && category && (
            <p className="rounded-[0.5rem] bg-admin-primary-lighter px-3 py-2 text-[13px] text-admin-gray-700">Under category <b className="text-admin-gray-900">{category.name}</b></p>
          )}
          <div>
            <label htmlFor="qa-name" className="mb-1.5 block text-[13px] font-medium text-admin-gray-800">{what} Name</label>
            <input
              id="qa-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
              placeholder={QUICK_PLACEHOLDER[kind]}
              maxLength={100}
              className={inputCls(!!err)}
            />
          </div>
          {(kind === "brand" || kind === "category") && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-admin-gray-800">
                {kind === "brand" ? "Logo" : "Image"} <span className="font-normal text-admin-gray-400">(optional)</span>
              </label>
              <label className="flex h-10 cursor-pointer items-center overflow-hidden rounded-[0.5rem] border border-[#e5e7eb] text-sm">
                <span className="flex h-full shrink-0 items-center border-r border-[#e5e7eb] bg-admin-gray-50 px-3 font-medium text-admin-gray-700">Choose file</span>
                <span className={cn("truncate px-3", logo ? "text-admin-gray-900" : "text-admin-gray-400")}>{logo ? logo.name : "No file chosen"}</span>
                <input type="file" accept="image/*" className="sr-only" aria-label={kind === "brand" ? "Brand logo" : "Category image"} onClick={(e) => ((e.target as HTMLInputElement).value = "")} onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
              </label>
              {logoUrl && (
                <div className="mt-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="" className="h-12 w-12 rounded-[0.5rem] border border-admin-gray-200 object-contain" />
                  <button type="button" onClick={() => setLogo(null)} className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              )}
            </div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-admin-gray-100 px-5 py-4">
          <button type="button" onClick={onClose} disabled={busy} className={btnCls}>Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="flex h-10 items-center gap-2 rounded-[0.5rem] bg-admin-primary px-4 text-sm font-semibold text-white hover:bg-admin-primary-dark disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add {what}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
