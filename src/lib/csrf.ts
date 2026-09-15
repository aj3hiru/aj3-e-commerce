import { cookies } from "next/headers";
import { randomBytes } from "crypto";

const CSRF_COOKIE = "csrf_token";

/** Mirrors csrfToken() from includes/functions.php — generates (or reuses) a
 *  per-session random token, readable by client JS so it can be echoed back
 *  in the form submission (double-submit cookie pattern). */
export async function getOrCreateCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE)?.value;
  if (existing) return existing;

  const token = randomBytes(32).toString("hex");
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by the client to submit it back
    sameSite: "lax",
    path: "/",
  });
  return token;
}

/** Mirrors csrfValid() — compares the submitted token against the cookie. */
export async function isCsrfValid(submittedToken: string | undefined | null): Promise<boolean> {
  if (!submittedToken) return false;
  const cookieStore = await cookies();
  const expected = cookieStore.get(CSRF_COOKIE)?.value;
  return !!expected && expected === submittedToken;
}
