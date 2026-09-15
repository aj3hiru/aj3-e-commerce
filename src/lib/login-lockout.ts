import { cookies } from "next/headers";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECS = 900; // 15 min — identical to the PHP version's constants
const COOKIE_NAME = "login_attempts";

interface AttemptState {
  attempts: number;
  lockoutUntil: number; // epoch seconds, 0 = not locked
}

/**
 * Re-implements the brute-force lockout in shop/login.php, which used PHP's
 * server-side $_SESSION to track $_SESSION['login_attempts'] and
 * $_SESSION['lockout_until']. Next.js API routes are stateless between
 * requests, so there is no direct equivalent of a PHP session here — this
 * version stores the same two numbers in a short-lived, httpOnly signed
 * cookie instead. The 5-attempts / 15-minute thresholds are unchanged.
 *
 * If you'd prefer server-side state (e.g. to rate-limit even if the client
 * clears cookies), swap this for a Redis/DB-backed counter keyed by IP —
 * the calling code in the login route doesn't need to change either way.
 */
export async function getAttemptState(): Promise<AttemptState> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return { attempts: 0, lockoutUntil: 0 };
  try {
    const parsed = JSON.parse(raw);
    return { attempts: Number(parsed.attempts) || 0, lockoutUntil: Number(parsed.lockoutUntil) || 0 };
  } catch {
    return { attempts: 0, lockoutUntil: 0 };
  }
}

export function isLocked(state: AttemptState): boolean {
  return state.lockoutUntil > Math.floor(Date.now() / 1000);
}

export function lockSecondsLeft(state: AttemptState): number {
  return Math.max(0, state.lockoutUntil - Math.floor(Date.now() / 1000));
}

/** Called after a failed login. Returns the new state so the route can decide what
 *  error message to show ("Incorrect..." vs "Too many failed attempts..."). */
export async function recordFailedAttempt(): Promise<AttemptState> {
  const cookieStore = await cookies();
  const current = await getAttemptState();
  const attempts = current.attempts + 1;
  const lockoutUntil = attempts >= MAX_ATTEMPTS ? Math.floor(Date.now() / 1000) + LOCKOUT_SECS : 0;
  const next: AttemptState = { attempts, lockoutUntil };

  cookieStore.set(COOKIE_NAME, JSON.stringify(next), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: LOCKOUT_SECS,
    path: "/",
  });
  return next;
}

/** Called after a successful login — clears the counter, matching the PHP
 *  `$_SESSION['login_attempts'] = 0; $_SESSION['lockout_until'] = 0;` reset. */
export async function clearAttempts(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export { MAX_ATTEMPTS, LOCKOUT_SECS };
