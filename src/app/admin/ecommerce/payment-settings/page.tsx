import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsHub } from "@/components/admin/SettingsHub";
import { DisplayOptionsPanel } from "@/components/admin/DisplayOptionsPanel";
import { PaymentSettings2Body, type PaymentMethod2Row } from "@/components/admin/payment-settings2/PaymentSettings2Body";
import { PAYMENT2_GROUPS, PAYMENT2_PREF_KEY, PAYMENT2_STANDALONE } from "@/components/admin/payment-settings2/displayOptions";
import { DashboardWidgetPrefsProvider } from "@/hooks/useDashboardWidgetPrefs";
import { getAdminSession, hasPermission } from "@/lib/admin-auth";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { prisma } from "@/lib/db";

/** Short customer-facing blurbs, one per gateway key — same set payment.php's
 *  own copy uses, not a new claim about what each provider does. */
const DESCRIPTIONS: Record<string, string> = {
  cod: "Customer pays in cash when the order is delivered — no gateway credentials needed.",
  paytm: "Accept UPI, wallet and card payments through the Paytm gateway.",
  phonepe: "Accept UPI and card payments through the PhonePe gateway.",
  razorpay: "Accept UPI, cards, netbanking and wallets through Razorpay.",
  bank_transfer: "Customer transfers directly to your bank account — you confirm payment manually.",
};

/**
 * /admin/ecommerce/payment-settings2 — a trial redesign of Payment Settings,
 * kept alongside /admin/ecommerce/payment-settings so the two can be
 * compared. Same access rule (manage_payment), same table
 * (ecom_payment_settings) and the same five real gateway keys the v1 page
 * and lib/payment-methods.ts already define (cod, paytm, phonepe,
 * razorpay, bank_transfer) — NOT the generic "UPI / Cards / Net Banking"
 * categories a payment-settings mockup might show, because those aren't
 * how this schema actually models a payment method: each row here is one
 * configured *gateway*, and a single gateway (Razorpay, say) can itself
 * accept UPI, cards and netbanking under one set of credentials.
 *
 * Also intentionally NOT included: "Transactions Today" / "Settlement
 * Balance" / "Failed Payments" cards or a Test Mode toggle. Nothing in this
 * schema records a per-gateway transaction ledger, settlement balance, or
 * live/test credential pairs — ecom_orders.payment_method (Cash/Card/UPI/
 * Split) is a separate, unrelated field from ecom_payment_settings.method_key
 * (the gateway itself), so those numbers can't be computed honestly from
 * what's actually stored. Building them would mean showing invented figures.
 *
 * To remove it once a choice is made, delete:
 *   src/app/admin/ecommerce/payment-settings2/
 *   src/components/admin/payment-settings2/
 *   src/app/api/ecommerce/payment-settings2/
 *   src/lib/payment2-save.ts
 * (the ecom_payment_settings.is_default column can stay — nothing else needs it removed.)
 */
export default async function PaymentSettings2Page() {
  const session = await getAdminSession();
  if (!session || !hasPermission(session.permissions, "ecommerce", "manage_payment")) {
    redirect("/staff/login");
  }

  const rows = await prisma.ecomPaymentSettings.findMany();
  const byKey = new Map((rows as { methodKey: string; name: string; text: string | null; config: unknown; isEnabled: boolean; isDefault: boolean }[]).map((r) => [r.methodKey, r]));

  const methods: PaymentMethod2Row[] = PAYMENT_METHODS.map((def) => {
    const row = byKey.get(def.key);
    const config = (row?.config as Record<string, string> | null) ?? {};
    const configured = def.fields.length === 0 || def.fields.every((f) => (config[f.key] ?? "").trim() !== "");
    return {
      key: def.key, label: def.label, description: DESCRIPTIONS[def.key] ?? "", fields: def.fields,
      name: row?.name ?? def.label, text: row?.text ?? "", config,
      isEnabled: row?.isEnabled ?? false, isDefault: row?.isDefault ?? false, configured,
    };
  });

  return (
    <DashboardWidgetPrefsProvider prefKey={PAYMENT2_PREF_KEY} groups={PAYMENT2_GROUPS} standalone={PAYMENT2_STANDALONE}>
      <AdminShell
        siteName="EduMint24"
        pageTitle="Business Settings"
        pageSubtitle="Payment methods — how your store accepts payments"
        username={session.username}
        role={session.role}
        permissions={session.permissions}
        headerActions={<div className="hidden items-center gap-3 xl:flex"><DisplayOptionsPanel variant="header" /></div>}
      >
        <SettingsHub active="payment" permissions={session.permissions}>
          <div className="mb-5 flex justify-end xl:hidden"><DisplayOptionsPanel variant="toolbar" /></div>
          <PaymentSettings2Body methods={methods} />
        </SettingsHub>
      </AdminShell>
    </DashboardWidgetPrefsProvider>
  );
}
