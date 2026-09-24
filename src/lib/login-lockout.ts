import { cacheDel, cacheGet, cacheSet } from "./redis";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECS = 900; // 15 min — identical to the PHP version's constants

interface AttemptState {
  attempts: number;
  lockoutUntil: number; // epoch seconds, 0 = not locked
}

/**
 * Re-implements the brute-force lockout in shop/login.php (5 attempts /
 * 15 minutes). The counter lives on the SERVER — in Redis when it's
 * configured, otherwise in this process's memory — keyed by the login
 * identity and by the client IP separately. It used to live in a plain
 * client cookie, which an attacker could simply not send back to get
 * unlimited guesses.
 */
const memory = new Map<string, AttemptState>();

function keysFor(identity: string, ip: string): string[] {
  const keys = [`login-lock:id:${identity.trim().toLowerCase()}`];
  // Without a known client IP every visitor would share one counter and five
  // bad guesses from anyone would lock the whole site out — skip it instead.
  if (ip && ip !== "UNKNOWN") keys.push(`login-lock:ip:${ip}`);
  return keys;
}

async function readKey(key: string): Promise<AttemptState> {
  const now = Math.floor(Date.now() / 1000);
  const state = (await cacheGet<AttemptState>(key)) ?? memory.get(key) ?? null;
  if (!state) return { attempts: 0, lockoutUntil: 0 };
  // An expired lock starts over from zero.
  if (state.lockoutUntil && state.lockoutUntil <= now) return { attempts: 0, lockoutUntil: 0 };
  return state;
}

async function writeKey(key: string, state: AttemptState): Promise<void> {
  memory.set(key, state);
  await cacheSet(key, state, LOCKOUT_SECS);
  // Keep the in-memory fallback from growing forever.
  if (memory.size > 10_000) memory.clear();
}

/** The most restrictive of the identity and IP counters. */
export async function getAttemptState(identity: string, ip: string): Promise<AttemptState> {
  const states = await Promise.all(keysFor(identity, ip).map(readKey));
  return states.reduce((a, b) => (b.lockoutUntil > a.lockoutUntil || b.attempts > a.attempts ? b : a));
}

export function isLocked(state: AttemptState): boolean {
  return state.lockoutUntil > Math.floor(Date.now() / 1000);
}

export function lockSecondsLeft(state: AttemptState): number {
  return Math.max(0, state.lockoutUntil - Math.floor(Date.now() / 1000));
}

/** Called after a failed login. Returns the new (most restrictive) state. */
export async function recordFailedAttempt(identity: string, ip: string): Promise<AttemptState> {
  let worst: AttemptState = { attempts: 0, lockoutUntil: 0 };
  for (const key of keysFor(identity, ip)) {
    const current = await readKey(key);
    const attempts = current.attempts + 1;
    const lockoutUntil = attempts >= MAX_ATTEMPTS ? Math.floor(Date.now() / 1000) + LOCKOUT_SECS : 0;
    const next = { attempts, lockoutUntil };
    await writeKey(key, next);
    if (next.lockoutUntil > worst.lockoutUntil || next.attempts > worst.attempts) worst = next;
  }
  return worst;
}

/** Called after a successful login — clears the identity counter (the IP
 *  counter is left alone so one valid account can't reset guesses at others). */
export async function clearAttempts(identity: string): Promise<void> {
  const [idKey] = keysFor(identity, "");
  memory.delete(idKey);
  await cacheDel(idKey);
}

export { MAX_ATTEMPTS, LOCKOUT_SECS };
