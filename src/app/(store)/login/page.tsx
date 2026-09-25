import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/customer-auth";
import { LoginForm } from "@/components/shop/LoginForm";
import { PhoneLogin } from "@/components/shop/auth/PhoneLogin";
import { ShopLayout } from "@/components/shop/ShopLayout";
import { getShopLayoutData } from "@/lib/shop-layout-data";
import { getAuthSettings } from "@/lib/auth-settings";
import { otpReady } from "@/types/auth-settings";

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

/**
 * Login. With mobile OTP on (Settings → Login & OTP): mobile number → OTP
 * (sign-up included), with password login as the alternative. Otherwise the
 * email / username + password form. Logged-in visitors are sent on.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [customerSession, resolvedParams] = await Promise.all([getCustomerSession(), searchParams]);
  if (customerSession) redirect("/account");

  const [layout, auth] = await Promise.all([getShopLayoutData(), getAuthSettings()]);
  const storeName = layout.business.businessName;

  return (
    <ShopLayout {...layout}>
      {otpReady(auth)
        ? <PhoneLogin firebase={auth.firebase} countryCode={auth.countryCode} passwordLogin={auth.passwordLogin} redirectTo={resolvedParams.redirect} storeName={storeName} />
        : <LoginForm redirectTo={resolvedParams.redirect} storeName={storeName} />}
    </ShopLayout>
  );
}
