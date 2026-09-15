import bcrypt from "bcryptjs";

/** Matches PHP's password_hash($password, PASSWORD_DEFAULT) — bcrypt, cost 10. */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Matches PHP's password_verify($password, $hash). Always resolves — never throws
 *  on a malformed/missing hash, mirroring the original's "dummy hash" timing-attack
 *  mitigation (comparing against a fixed dummy hash when no user row was found). */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const DUMMY_HASH = "$2a$10$invaliddummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  try {
    return await bcrypt.compare(password, hash ?? DUMMY_HASH);
  } catch {
    return false;
  }
}
