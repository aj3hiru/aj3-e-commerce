import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSettings } from "@/lib/auth-settings";
import { otpReady } from "@/types/auth-settings";
import { verifyFirebasePhoneToken } from "@/lib/firebase-token";
import { findCustomerByPhone } from "@/lib/customer-phone";
import { setCustomerSessionCookie } from "@/lib/session-cookies";

/**
 * Mobile OTP login / sign-up. The browser verifies the OTP with Firebase and
 * sends us the resulting ID token; we check it came from our Firebase project
 * for a verified phone, then log that customer in — or create the account
 * (just the phone) and send them to complete their profile.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthSettings();
  if (!otpReady(auth)) return NextResponse.json({ success: false, message: "OTP login is not enabled." }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!idToken) return NextResponse.json({ success: false, message: "Missing verification." }, { status: 400 });

  let phone: string;
  try {
    phone = (await verifyFirebasePhoneToken(idToken, auth.firebase.projectId)).phone;
  } catch (e) {
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : "Verification failed." }, { status: 401 });
  }

  const next = safeRedirect(body.redirect);
  let customer = await findCustomerByPhone(phone);
  let created = false;
  if (customer) {
    if (customer.status !== "active") return NextResponse.json({ success: false, message: "Your account has been suspended. Please contact support." });
  } else {
    customer = await prisma.ecomCustomer.create({ data: { name: "", phone, customerType: "online", status: "active" } });
    created = true;
  }

  await setCustomerSessionCookie(customer.id, customer.password);
  const needsProfile = created || !customer.name.trim();
  const redirect = needsProfile ? `/shop/account?setup=1${next ? `&next=${encodeURIComponent(next)}` : ""}` : next ?? "/shop/account";
  return NextResponse.json({ success: true, created, redirect });
}

function safeRedirect(target: unknown): string | null {
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return null;
  return target;
}
