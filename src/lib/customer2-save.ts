/**
 * Rules for saving a customer from /admin/ecommerce/customers. Pure (no
 * database), so the form and the API apply exactly the same checks.
 *
 * One difference from the old Customers page: an email is NOT required. A
 * walk-in customer at the billing counter often has only a phone number, and
 * the database allows a customer without an email. Either an email or a phone
 * must be given, so a customer can always be found again.
 */
export interface CleanCustomer {
  name: string;
  email: string | null;
  phone: string | null;
  customerType: "online" | "offline";
  address: string | null;
  status: "active" | "inactive";
}

export type CustomerParse = { ok: true; value: CleanCustomer } | { ok: false; message: string; field?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseCustomerInput(raw: unknown): CustomerParse {
  if (!raw || typeof raw !== "object") return { ok: false, message: "Invalid request." };
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const name = str(b.name);
  if (!name) return { ok: false, message: "Enter the customer's name.", field: "name" };
  if (name.length > 150) return { ok: false, message: "The name can be at most 150 characters.", field: "name" };

  const email = str(b.email);
  if (email && !EMAIL.test(email)) return { ok: false, message: "That email address doesn't look right.", field: "email" };

  const phone = str(b.phone);
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) return { ok: false, message: "That phone number doesn't look right.", field: "phone" };
  if (!email && !phone) return { ok: false, message: "Give at least a phone number or an email, so the customer can be found later.", field: "phone" };

  const address = str(b.address);
  if (address.length > 500) return { ok: false, message: "The address is too long.", field: "address" };

  // An online customer signs in with an email or (mobile OTP) a phone number.
  const customerType = b.customerType === "offline" ? "offline" : "online";
  if (customerType === "online" && !email && !phone) return { ok: false, message: "An online customer needs an email or a mobile number to sign in.", field: "email" };

  return {
    ok: true,
    value: {
      name,
      email: email || null,
      phone: phone || null,
      customerType,
      address: address || null,
      status: b.status === "inactive" ? "inactive" : "active",
    },
  };
}
