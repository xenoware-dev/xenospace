import { hash, verify, Algorithm } from '@node-rs/argon2';
import { PASSWORD_MAX } from '@xenospace/shared';
import { logger } from '../lib/logger.js';

/**
 * Password hashing with Argon2id.
 *
 * Argon2id is the current OWASP first choice: the memory cost makes GPU and
 * ASIC cracking expensive in a way iteration count alone does not, and the
 * hybrid mode resists both side-channel and time-memory trade-off attacks.
 */

/**
 * OWASP's recommended Argon2id baseline (19 MiB, 2 passes, 1 lane). Memory is
 * the expensive dimension for an attacker, so it is raised before time.
 * Each hash costs ~19 MiB, which also bounds how many can run concurrently —
 * hence the length ceiling enforced in the schema.
 */
const PARAMS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  // Defence in depth: validation already bounds this, but an unbounded password
  // reaching Argon2 is a cheap way to exhaust server memory.
  if (plain.length > PASSWORD_MAX) {
    throw new Error(`Refusing to hash a password longer than ${PASSWORD_MAX} characters`);
  }
  return hash(plain, PARAMS);
}

/**
 * Verifies a password against a stored hash. Returns false rather than throwing
 * on a malformed hash, so a corrupt row denies access instead of 500ing.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  if (!storedHash || plain.length > PASSWORD_MAX) return false;
  try {
    return await verify(storedHash, plain, PARAMS);
  } catch (err) {
    logger.error({ err }, 'password verification failed against a malformed hash');
    return false;
  }
}

/**
 * A hash of a throwaway value, used to equalise timing on the login path.
 *
 * Without this, "no such account" returns in microseconds while a real account
 * costs a full Argon2 verification — a difference an attacker can measure to
 * enumerate valid emails. Computed once at boot.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('xenospace-timing-equaliser-not-a-real-password-#1');
  return dummyHash;
}

/**
 * Burns the same work a real verification would, for an email that does not
 * exist. Always returns false.
 */
export async function wasteVerificationTime(plain: string): Promise<false> {
  await verifyPassword(await getDummyHash(), plain);
  return false;
}

/**
 * True when a stored hash was produced with weaker parameters than current
 * policy, meaning it should be re-hashed on the user's next successful login.
 */
export function needsRehash(storedHash: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)/.exec(storedHash);
  if (!m) return true; // not argon2id at all, e.g. a legacy bcrypt hash
  const [, mem, time, par] = m;
  return (
    Number(mem) < PARAMS.memoryCost ||
    Number(time) < PARAMS.timeCost ||
    Number(par) !== PARAMS.parallelism
  );
}
