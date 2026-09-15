"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";

export function CsvImportExportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [itemType, setItemType] = useState("physical");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setNotice({ type: "error", message: "Please choose a valid CSV file." });
      return;
    }
    setImporting(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.set("csv", file);
      fd.set("item_type", itemType);
      const res = await fetch("/api/ecommerce/products/import", { method: "POST", body: fd });
      const data = await res.json();
      setNotice({ type: data.success ? "success" : "error", message: data.message });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Export Products</h5>
        <p className="text-sm text-admin-gray-500 mb-3">Download every product as a CSV file.</p>
        <a
          href="/api/ecommerce/products/export"
          className="inline-flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-4 py-2"
        >
          <Download className="w-4 h-4" /> Export CSV
        </a>
      </div>

      <div className="bg-white rounded-lg border border-admin-gray-200 p-5">
        <h5 className="font-bold mb-3">Import Products</h5>
        <p className="text-sm text-admin-gray-500 mb-3">
          Required columns: <code className="bg-admin-gray-100 px-1 rounded">name</code>, <code className="bg-admin-gray-100 px-1 rounded">price</code>.
          Optional: <code className="bg-admin-gray-100 px-1 rounded">sku</code>, <code className="bg-admin-gray-100 px-1 rounded">stock_qty</code>, <code className="bg-admin-gray-100 px-1 rounded">status</code>.
        </p>

        {notice && (
          <div className={`text-sm rounded px-3 py-2 mb-3 ${notice.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {notice.message}
          </div>
        )}

        <form onSubmit={handleImport} className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">CSV File</label>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Default Product Type (for imported rows)</label>
            <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
              <option value="physical">Physical</option>
              <option value="digital">Digital</option>
              <option value="license">License</option>
              <option value="affiliate">Affiliate</option>
            </select>
          </div>
          <button type="submit" disabled={importing} className="flex items-center gap-1.5 bg-admin-primary hover:bg-admin-primary-dark text-white text-sm font-medium rounded px-4 py-2 disabled:opacity-60">
            <Upload className="w-4 h-4" /> {importing ? "Importing…" : "Import CSV"}
          </button>
        </form>
      </div>
    </div>
  );
}
