"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Option { id?: number; name?: string; slug?: string; label?: string; tagGroup?: string }
export function ProductCreateForm({ categories, brands, tags }: { categories: Option[]; brands: Option[]; tags: Option[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setError("");
    const res = await fetch("/api/ecommerce/products", { method: "POST", body: new FormData(e.currentTarget) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) { setError(data.message || "Product could not be created."); setSaving(false); return; }
    router.push(data.redirect); router.refresh();
  }
  const badges = tags.filter(t => t.tagGroup === "badge");
  const itemTypes = tags.filter(t => t.tagGroup === "item_type");
  return <form onSubmit={submit} encType="multipart/form-data" className="bg-white border border-admin-gray-200 rounded-lg p-5 space-y-5 max-w-5xl">
    {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm">{error}</div>}
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="Product name *" name="name" required />
      <Field label="Slug" name="slug" placeholder="Auto-generated if empty" />
      <Field label="SKU" name="sku" />
      <Field label="HSN code" name="hsn_code" />
      <Field label="Price *" name="price" type="number" step="0.01" min="0" required />
      <Field label="Sale price" name="sale_price" type="number" step="0.01" min="0" />
      <Field label="GST rate (%)" name="gst_rate" type="number" step="0.01" min="0" defaultValue="0" />
      <Field label="Stock quantity" name="stock_qty" type="number" min="0" defaultValue="0" />
      <Select label="Product type" name="product_type" options={[{value:"physical",label:"Physical"},{value:"digital",label:"Digital"},{value:"license",label:"License"},{value:"affiliate",label:"Affiliate"}]} />
      <Select label="Category" name="category_id" options={[{value:"",label:"Select category"}, ...categories.map(x => ({value:String(x.id),label:x.name!}))]} />
      <Select label="Brand" name="brand_id" options={[{value:"",label:"Select brand"}, ...brands.map(x => ({value:String(x.id),label:x.name!}))]} />
      <Select label="Badge" name="badge_tag" options={[{value:"none",label:"None"}, ...badges.map(x => ({value:x.slug!,label:x.label!}))]} />
      <Select label="Item type" name="item_type" options={[{value:"normal",label:"Normal"}, ...itemTypes.map(x => ({value:x.slug!,label:x.label!}))]} />
      <Select label="Status" name="status" options={[{value:"active",label:"Active"},{value:"inactive",label:"Inactive"}]} />
      <Field label="Barcode" name="barcode" />
      <div><label className="block text-sm font-medium mb-1">Product image</label><input name="image" type="file" accept="image/*" className="block w-full text-sm" /></div>
    </div>
    <div><label className="block text-sm font-medium mb-1">Description</label><textarea name="description" rows={5} className="w-full border border-admin-gray-300 rounded px-3 py-2 text-sm" /></div>
    <div className="grid md:grid-cols-3 gap-4"><Field label="Download link" name="download_link" /><Field label="License key" name="license_key" /><Field label="Affiliate URL" name="affiliate_url" /></div>
    <div className="flex flex-wrap gap-5 text-sm"><label><input type="checkbox" name="is_campaign" className="mr-2" />Campaign product</label><label><input type="checkbox" name="show_on_home" className="mr-2" />Show on home</label></div>
    <button disabled={saving} className="bg-admin-primary hover:bg-admin-primary-dark disabled:opacity-60 text-white rounded px-5 py-2.5 text-sm font-medium">{saving ? "Saving..." : "Create product"}</button>
  </form>;
}
function Field({ label, name, type="text", ...props }: { label:string; name:string; type?:string; [key:string]:unknown }) { return <div><label className="block text-sm font-medium mb-1">{label}</label><input name={name} type={type} className="w-full border border-admin-gray-300 rounded px-3 py-2 text-sm" {...props} /></div>; }
function Select({ label, name, options }: { label:string; name:string; options:{value:string;label:string}[] }) { return <div><label className="block text-sm font-medium mb-1">{label}</label><select name={name} className="w-full border border-admin-gray-300 rounded px-3 py-2 text-sm">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>; }
