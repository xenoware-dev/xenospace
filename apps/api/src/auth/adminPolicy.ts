import type { Role } from '@xenospace/shared';
import { env } from '../config/env.js';
import type { Queryable } from '../db/index.js';
import { forbidden } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { invalidateAuthCache } from '../middleware/authenticate.js';

/**
 * Who may be a team lead.
 *
 * With ADMIN_EMAILS set, the list is the whole answer: those addresses lead,
 * everyone else develops. Without it, the first account in an empty workspace
 * bootstraps as lead, which is only safe before anyone else can reach the app.
 */

const pinned = () => env.ADMIN_EMAILS.length > 0;
const listed = (email: string) => env.ADMIN_EMAILS.includes(email.trim().toLowerCase());

/** True for an address named in ADMIN_EMAILS. */
export const isPinnedAdmin = listed;

/**
 * Role for an account being created. `emailVerified` must be true for the
 * listed address to get the lead role: password sign-up does not prove the
 * inbox, so otherwise anyone could register as the lead's address first.
 */
export function roleForNewAccount(email: string, opts: { isFirstUser: boolean; emailVerified: boolean }): Role {
  if (pinned()) return listed(email) && opts.emailVerified ? 'ADMIN' : 'DEVELOPER';
  return opts.isFirstUser ? 'ADMIN' : 'DEVELOPER';
}

/** Password sign-up is refused for a lead address; it must come via Google. */
export function assertMaySelfRegister(email: string): void {
  if (pinned() && listed(email)) {
    throw forbidden('This address is reserved for the team lead. Sign in with Google instead.');
  }
}

/** Promotion or an ADMIN invitation is only allowed for a listed address. */
export function assertMayHoldAdmin(email: string): void {
  if (pinned() && !listed(email)) {
    throw forbidden('Only the configured team lead account can be a team lead.');
  }
}

/**
 * Brings stored roles in line with ADMIN_EMAILS: demotes anyone else who is a
 * lead, and promotes a listed account once its email is verified. Runs at boot,
 * so editing the list and restarting is how the lead is changed.
 */
export async function reconcileAdminRoles(db: Queryable): Promise<void> {
  if (!pinned()) return;
  const { rows: demoted } = await db.query<{ id: string; email: string }>(
    `UPDATE users SET role = 'DEVELOPER'
      WHERE role = 'ADMIN' AND NOT (lower(email) = ANY($1::text[]) AND email_verified)
      RETURNING id, email`,
    [env.ADMIN_EMAILS],
  );
  const { rows: promoted } = await db.query<{ id: string; email: string }>(
    `UPDATE users SET role = 'ADMIN'
      WHERE role <> 'ADMIN' AND lower(email) = ANY($1::text[]) AND email_verified
      RETURNING id, email`,
    [env.ADMIN_EMAILS],
  );
  const changed = [...demoted, ...promoted].map((u) => u.id);
  if (changed.length > 0) {
    // Their access tokens and cached principals carry the old role.
    await db.query(`UPDATE users SET tokens_valid_from = now() WHERE id = ANY($1::uuid[])`, [changed]);
    // The cached principal would otherwise keep the old role until it expires.
    for (const id of changed) await invalidateAuthCache(id);
    logger.warn(
      { demoted: demoted.map((u) => u.email), promoted: promoted.map((u) => u.email) },
      'team lead roles reconciled with ADMIN_EMAILS',
    );
  }
}
