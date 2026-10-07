import crypto from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { ERROR_CODES, type Role } from '@xenospace/shared';
import type { Request, Response } from 'express';
import { env, isProd } from '../config/env.js';
import { unauthenticated } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { hashToken, randomToken } from './crypto.js';
import { db, type Queryable } from '../db/index.js';
import { cache } from '../cache/index.js';

/**
 * Token issuance and verification.
 *
 * Access tokens are short-lived JWTs held in memory by the SPA. Refresh tokens
 * are opaque random strings in an httpOnly cookie, stored server-side as
 * hashes, single-use, and rotated on every refresh. The split matters: a JWT is
 * unrevocable until it expires, so it is kept brief, and all long-lived
 * authority lives in the database row that a logout can actually delete.
 */

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export const REFRESH_COOKIE = 'xs_rt';
export const CSRF_COOKIE = 'xs_csrf';

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  role: Role;
  /** Session family this token belongs to; see migration 002. */
  sid: string;
  /**
   * Issued-at in milliseconds.
   *
   * The standard `iat` claim has one-second resolution, which cannot be
   * compared against a `timestamptz` without ambiguity: a token minted at
   * 12:00:05.7 carries iat=05, so it is indistinguishable from one minted at
   * 12:00:05.1. That ambiguity made freshly issued tokens appear to predate
   * the account or password change they belong to. Both sides of this
   * comparison are ours, so the precision is simply raised to match.
   */
  ims: number;
}

export async function signAccessToken(userId: string, role: Role, sessionId: string): Promise<string> {
  return new SignJWT({ role, sid: sessionId, ims: Date.now() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setExpirationTime(env.ACCESS_TOKEN_TTL)
    .sign(accessKey);
}

/**
 * Verifies an access token's signature and claims.
 *
 * `algorithms` is pinned to HS256. Without it, a token could declare `alg:
 * none` or a confused algorithm and bypass verification entirely.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ['HS256'],
      clockTolerance: 5,
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.ims !== 'number'
    ) {
      throw unauthenticated(ERROR_CODES.TOKEN_INVALID);
    }
    return payload as AccessTokenClaims;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ERR_JWT_EXPIRED') throw unauthenticated(ERROR_CODES.TOKEN_EXPIRED);
    throw unauthenticated(ERROR_CODES.TOKEN_INVALID);
  }
}

export function accessTokenTtlSeconds(): number {
  const m = /^(\d+)([smhd])$/.exec(env.ACCESS_TOKEN_TTL);
  if (!m) return 900;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86_400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n * mult;
}

/* ------------------------------------------------------------------ sessions */

export interface IssuedSession {
  /** This row. Changes on every rotation. */
  sessionId: string;
  /**
   * The sign-in this row descends from. Stable across rotations, and the id
   * access tokens carry — see migration 002.
   */
  familyId: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Creates a session row and returns the raw refresh token, which is never stored. */
export async function issueSession(
  tx: Queryable,
  userId: string,
  opts: { userAgent?: string | null; ipAddress?: string | null; remember?: boolean },
  /** Set when rotating, so the successor stays in its predecessor's family. */
  familyId?: string,
): Promise<IssuedSession> {
  const token = randomToken(32);
  const id = crypto.randomUUID();
  const family = familyId ?? id;
  const days = opts.remember ? env.REFRESH_TOKEN_REMEMBER_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  await tx.query(
    `INSERT INTO sessions (id, family_id, user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, family, userId, hashToken(token), opts.userAgent ?? null, opts.ipAddress ?? null, expiresAt],
  );
  return { sessionId: id, familyId: family, refreshToken: token, expiresAt };
}

interface SessionRow {
  id: string;
  family_id: string;
  created_at: string;
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
  role: Role;
  status: string;
  tokens_valid_from: string;
}

/**
 * Consumes a refresh token and issues its successor.
 *
 * Rotation is what makes a stolen refresh token survivable. Each token is
 * single-use; presenting one that has already been rotated means two parties
 * hold it, so the entire session family is revoked and both are forced to sign
 * in again. That turns silent long-term theft into a visible logout.
 *
 * This function manages its own transactions and must NOT be handed one. The
 * compromise response has to be committed *before* the error is raised — doing
 * the revocation inside a transaction that then throws would roll it back, so
 * the API would report the theft while leaving the stolen family usable.
 */
export async function rotateRefreshToken(
  rawToken: string,
  opts: { userAgent?: string | null; ipAddress?: string | null },
): Promise<{ userId: string; role: Role; session: IssuedSession }> {
  const tokenHash = hashToken(rawToken);

  const { rows } = await db().query<SessionRow>(
    `SELECT s.id, s.family_id, s.user_id, s.created_at, s.expires_at, s.revoked_at, s.replaced_by,
            u.role, u.status, u.tokens_valid_from
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [tokenHash],
  );

  const row = rows[0];
  if (!row) throw unauthenticated(ERROR_CODES.TOKEN_INVALID);

  // A rotated token presented again moments later, whose successor has never
  // been used, is a lost response rather than theft: the browser sent the
  // refresh, the server rotated, and the page reloaded or navigated before the
  // new cookie arrived. Burning the family there signs people out at random
  // (it showed up as "I always have to sign in twice" after Google sign-in).
  if (row.replaced_by && row.revoked_at && Date.now() - new Date(row.revoked_at).getTime() < REUSE_GRACE_MS) {
    const recovered = await reissueWithinGrace(row, opts);
    if (recovered) return recovered;
  }

  // Reuse of a rotated or revoked token: treat as compromise and burn the whole
  // family, in its own committed transaction.
  if (row.replaced_by || row.revoked_at) {
    logger.warn(
      { userId: row.user_id, sessionId: row.id },
      'refresh token reuse detected — revoking every session for this user',
    );
    await db().transaction(async (tx) => {
      await revokeAllSessions(tx, row.user_id);
    });
    await dropAuthCache(row.user_id);
    throw unauthenticated(
      ERROR_CODES.TOKEN_INVALID,
      'This session was ended for security reasons. Please sign in again.',
    );
  }

  if (new Date(row.expires_at) <= new Date()) throw unauthenticated(ERROR_CODES.TOKEN_EXPIRED);
  if (row.status !== 'ACTIVE') throw unauthenticated(ERROR_CODES.ACCOUNT_INACTIVE);

  return db().transaction(async (tx) => {
    // Keep the lifetime the user chose at sign-in. Rotating with the default
    // would quietly shrink "keep me signed in" to the short lifetime.
    const lifetimeDays =
      (new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 86_400_000;
    const remember = lifetimeDays > env.REFRESH_TOKEN_TTL_DAYS + 0.5;
    const next = await issueSession(tx, row.user_id, { ...opts, remember }, row.family_id);

    /*
     * Spending the old token is guarded on it still being unspent. Two
     * concurrent refreshes with the same token both pass the checks above, and
     * this is what makes only one of them win: the loser's UPDATE matches no
     * row, so its newly issued session is rolled back with the transaction
     * rather than leaving an orphan.
     */
    const { rowCount } = await tx.query(
      `UPDATE sessions
          SET revoked_at = now(), replaced_by = $2, last_used_at = now()
        WHERE id = $1 AND revoked_at IS NULL`,
      [row.id, next.sessionId],
    );
    if (rowCount === 0) {
      throw unauthenticated(ERROR_CODES.TOKEN_INVALID, 'This session was already refreshed. Please sign in again.');
    }

    return { userId: row.user_id, role: row.role, session: next };
  });
}

/**
 * How long after rotation the previous refresh token may still be presented
 * once. Long enough for a slow round trip and a reload; short enough that a
 * stolen token is useless soon after the owner's next refresh. Comparable to
 * the "reuse interval" in Auth0 and Okta.
 */
const REUSE_GRACE_MS = 30_000;

/**
 * The grace path. Succeeds only if the successor is untouched — nobody has
 * refreshed with it and it was not signed out — which is exactly the lost
 * response case. The unused successor is retired and a new one issued in the
 * same family, so at most one live token exists. If the successor *was* used,
 * two parties really do hold this family, and the caller falls through to the
 * theft response.
 */
async function reissueWithinGrace(
  row: SessionRow,
  opts: { userAgent?: string | null; ipAddress?: string | null },
): Promise<{ userId: string; role: Role; session: IssuedSession } | null> {
  if (row.status !== 'ACTIVE' || new Date(row.expires_at) <= new Date()) return null;
  try {
    return await db().transaction(async (tx) => {
      const lifetimeDays =
        (new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 86_400_000;
      const remember = lifetimeDays > env.REFRESH_TOKEN_TTL_DAYS + 0.5;
      const next = await issueSession(tx, row.user_id, { ...opts, remember }, row.family_id);
      // Guarded on the successor still being unspent and unrevoked, so a
      // concurrent legitimate refresh and this path cannot both win.
      const { rowCount } = await tx.query(
        `UPDATE sessions SET revoked_at = now(), replaced_by = $2
          WHERE id = $1 AND revoked_at IS NULL AND replaced_by IS NULL`,
        [row.replaced_by, next.sessionId],
      );
      if (rowCount === 0) throw new GraceRefused();
      logger.info({ userId: row.user_id, sessionId: row.id }, 'refresh token re-presented within grace; reissued');
      return { userId: row.user_id, role: row.role, session: next };
    });
  } catch (err) {
    if (err instanceof GraceRefused) return null;
    throw err;
  }
}

class GraceRefused extends Error {}

/** Ends a whole sign-in: every row in the family, so no rotation survives. */
export async function revokeSession(tx: Queryable, familyId: string, userId?: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `UPDATE sessions SET revoked_at = now()
      WHERE family_id = $1 AND revoked_at IS NULL ${userId ? 'AND user_id = $2' : ''}`,
    userId ? [familyId, userId] : [familyId],
  );
  return rowCount > 0;
}

/**
 * Ends the sign-in a refresh token belongs to (the whole family) and returns
 * its user, so the caller can drop that user's cached auth state.
 */
export async function revokeSessionByToken(tx: Queryable, rawToken: string): Promise<string | null> {
  const { rows } = await tx.query<{ user_id: string }>(
    `UPDATE sessions SET revoked_at = now()
      WHERE family_id = (SELECT family_id FROM sessions WHERE token_hash = $1)
        AND revoked_at IS NULL
      RETURNING user_id`,
    [hashToken(rawToken)],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Drops cached auth state for a user. Every revocation must call this, or a
 * revoked access token keeps passing authentication until the cache entry's
 * TTL runs out. Lives here rather than in the middleware to avoid an import
 * cycle (the middleware imports this module).
 */
export async function dropAuthCache(userId: string): Promise<void> {
  await cache.deletePrefix(`auth:${userId}:`);
}

export async function revokeAllSessions(tx: Queryable, userId: string, exceptFamilyId?: string): Promise<number> {
  const { rowCount } = await tx.query(
    `UPDATE sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL
      ${exceptFamilyId ? 'AND family_id <> $2' : ''}`,
    exceptFamilyId ? [userId, exceptFamilyId] : [userId],
  );
  return rowCount;
}

/** Removes expired and long-revoked rows. Called on a schedule, not per request. */
export async function pruneSessions(tx: Queryable): Promise<number> {
  const { rowCount } = await tx.query(
    `DELETE FROM sessions
      WHERE expires_at < now() - interval '7 days'
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')`,
  );
  return rowCount;
}

/* ------------------------------------------------------------------- cookies */

/**
 * Cookie attributes for the refresh token.
 *
 * `httpOnly` keeps it out of reach of any XSS that lands on the page, which is
 * the whole reason the refresh token is not in localStorage. `sameSite: lax`
 * suits a same-site SPA and still blocks cross-site POSTs; a cross-origin
 * deployment needs `none`, which then *requires* `secure`.
 */
function refreshCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    // Explicit rather than inferred: an earlier version guessed from the host
    // (port included), chose `none` in development, and browsers then dropped
    // the cookie for lacking Secure — so every reload signed the user out.
    sameSite: env.COOKIE_SAMESITE,
    path: '/api/v1/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions(expiresAt));
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}

export function readRefreshCookie(req: Request): string | null {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Issues the CSRF token as a readable cookie.
 *
 * Deliberately *not* httpOnly: the double-submit pattern requires the SPA to
 * read it and echo it in a header. Safety comes from the same-origin policy —
 * a cross-site attacker can cause the cookie to be sent but cannot read it to
 * construct the matching header.
 */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
    // Must outlive the longest refresh token. It was once a day while a
    // remembered refresh token lasted thirty, so after a day the refresh call
    // had no CSRF token to send and "keep me signed in" stopped working.
    maxAge: env.REFRESH_TOKEN_REMEMBER_DAYS * 86_400_000,
  });
}

if (!isProd && env.COOKIE_SECURE === false) {
  logger.warn('cookies are being issued without the Secure flag (development only)');
}
