import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Symmetric cryptography and constant-time helpers.
 *
 * One rule governs this file: anything that compares a secret uses a
 * constant-time comparison, because a byte-at-a-time `===` on a token leaks its
 * contents through response timing.
 */

/** Derives a 32-byte key from a configured secret. */
function deriveKey(secret: string, purpose: string): Buffer {
  // HKDF binds the key to its purpose, so the same configured secret used for
  // two different things yields two unrelated keys.
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'xenospace-salt', purpose, 32));
}

const ENCRYPTION_KEY = deriveKey(env.ENCRYPTION_KEY, 'field-encryption');

const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const TAG_BYTES = 16;

/**
 * Encrypts a value with AES-256-GCM. Used for repository access tokens and TOTP
 * secrets — data the application must be able to read back, unlike a password.
 *
 * Output format: `v1.<iv>.<tag>.<ciphertext>`, all base64url. The version
 * prefix lets a future key rotation decrypt old values rather than orphaning them.
 */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Returns null for anything that does not decrypt and authenticate cleanly. */
export function decryptField(payload: string): string | null {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1]!, 'base64url');
    const tag = Buffer.from(parts[2]!, 'base64url');
    const ciphertext = Buffer.from(parts[3]!, 'base64url');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // A failed auth tag means tampering or a rotated key. Either way the
    // value is unusable, and the reason must not be distinguishable.
    return null;
  }
}

/** Cryptographically random, URL-safe token. 32 bytes ≈ 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Hash stored in place of a refresh/reset token.
 *
 * SHA-256 with no salt is correct here, unlike for passwords: the input is
 * already 256 bits of uniform randomness, so it is not brute-forceable, and an
 * unsalted digest is what makes lookup-by-token a single indexed query.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Constant-time string comparison. Returns false on length mismatch. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on unequal lengths, and length is not a secret here.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** HMAC-SHA256, hex encoded. Used for CSRF and OAuth state signing. */
export function hmac(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

export function verifyHmac(value: string, signature: string, secret: string): boolean {
  return timingSafeEqual(hmac(value, secret), signature);
}

/** Short, unguessable identifier for correlating a request through the logs. */
export function requestId(): string {
  return crypto.randomBytes(8).toString('hex');
}
