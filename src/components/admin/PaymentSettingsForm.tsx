"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

export interface PaymentSettingRow {
  methodKey: string;
  name: string;
  image: string | null;
  text: string;
  config: Record<string, string>;
  isEnabled: boolean;
}

export function PaymentSettingsForm({ settings }: { settings: Record<string, PaymentSettingRow> }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(PAYMENT_METHODS[0].key);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const methodDef = PAYMENT_METHODS.find((m) => m.key === activeTab)!;
  const current = settings[activeTab] ?? { methodKey: activeTab, name: methodDef.label, image: null, text: "", config: {}, isEnabled: false };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setNotice(null);
    const formEl = e.currentTarget;
    const fd = new FormData(formEl);
    try {
      const res = await fetch("/api/ecommerce/payment-settings", { method: "POST", body: fd });
      const data = await res.json();
      setNotice(data.success ? "Payment settings saved!" : data.message);
      if (data.success) router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex gap-1.5 border-b border-admin-gray-200 mb-4 overflow-x-auto">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.key}
            onClick={() => setActiveTab(m.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px",
              activeTab === m.key ? "border-admin-primary text-admin-primary" : "border-transparent text-admin-gray-500 hover:text-admin-gray-800"
            )}
          >
            {m.label}
            {settings[m.key]?.isEnabled && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
          </button>
        ))}
      </div>

      {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded px-4 py-2.5 mb-4">{notice}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-admin-gray-200 p-5 max-w-xl" encType="multipart/form-data">
        <input type="hidden" name="method_key" value={activeTab} />

        <label className="flex items-center gap-2 mb-4">
          <input type="checkbox" name="status" defaultChecked={current.isEnabled} className="accent-admin-primary" />
          <span className="text-sm font-medium">Enable this payment method</span>
        </label>

        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">Display Name</label>
          <input name="name" defaultValue={current.name} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>

        <label htmlFor="payPhoto" className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-admin-gray-300 rounded-lg h-24 cursor-pointer overflow-hidden mb-3">
          {current.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/${current.image}`} alt="" className="h-full object-contain" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5 text-admin-gray-400" />
              <span className="text-xs text-admin-gray-400">Upload icon/QR image</span>
            </>
          )}
        </label>
        <input type="file" id="payPhoto" name="photo" accept="image/*" className="hidden" />

        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">Customer-Facing Instructions</label>
          <textarea name="text" rows={2} defaultValue={current.text} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" />
        </div>

        {methodDef.fields.map((field) => (
          <div key={field.key} className="mb-3">
            <label className="block text-xs font-medium mb-1">{field.label}</label>
            {field.type === "select" ? (
              <select name={`pkey[${field.key}]`} defaultValue={current.config[field.key] ?? ""} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm">
                {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input name={`pkey[${field.key}]`} defaultValue={current.config[field.key] ?? ""} className="w-full border border-admin-gray-200 rounded px-3 py-2 text-sm" placeholder={field.label} />
            )}
          </div>
        ))}

        <button type="submit" disabled={submitting} className="w-full bg-admin-primary hover:bg-admin-primary-dark text-white font-semibold rounded-lg py-2.5 disabled:opacity-60 mt-2">
          {submitting ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
