import { authenticator } from 'otplib';
import { env } from '../config/env.js';
import { decryptField, encryptField } from './crypto.js';

/**
 * TOTP second factor (RFC 6238).
 *
 * Secrets are stored encrypted, not hashed: verifying a code requires the
 * original secret, so this is a case where the application legitimately needs
 * to read the value back.
 */

authenticator.options = {
  // One step of drift either way tolerates clock skew between phone and server
  // without widening the window enough to matter for an attacker.
  window: 1,
  step: 30,
  digits: 6,
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

export function encryptTotpSecret(secret: string): string {
  return encryptField(secret);
}

/** The `otpauth://` URI the authenticator app scans as a QR code. */
export function totpUri(secret: string, accountEmail: string): string {
  return authenticator.keyuri(accountEmail, env.JWT_ISSUER, secret);
}

/**
 * Verifies a code against an encrypted stored secret.
 *
 * Returns false for an undecryptable secret rather than throwing, so a key
 * rotation denies the second factor instead of erroring the login.
 */
export function verifyTotp(encryptedSecret: string | null, code: string): boolean {
  if (!encryptedSecret) return false;
  const secret = decryptField(encryptedSecret);
  if (!secret) return false;
  try {
    return authenticator.verify({ token: code, secret });
  } catch {
    return false;
  }
}
