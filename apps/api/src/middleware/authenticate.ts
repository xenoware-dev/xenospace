import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES, can, permissionsFor, type Permission, type Role } from '@xenospace/shared';
import { dropAuthCache, verifyAccessToken } from '../auth/tokens.js';
import { db } from '../db/index.js';
import { forbidden, unauthenticated } from '../lib/errors.js';
import { cache } from '../cache/index.js';

/** The authenticated principal, attached to every request that passes auth. */
export interface Principal {
  id: string;
  role: Role;
  sessionId: string;
  email: string;
  name: string;
  status: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Principal;
      requestId?: string;
    }
  }
}

/** Pulls the bearer token out of the Authorization header. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  // Scheme comparison is case-insensitive per RFC 7235.
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

interface UserAuthRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  tokens_valid_from: string;
}

/**
 * Cached authentication state, keyed by user.
 *
 * Every request would otherwise cost a users+sessions join. The TTL is short
 * and the entry is invalidated explicitly whenever a role, status or session
 * changes, so a revoked session cannot outlive it by more than the TTL.
 */
const AUTH_CACHE_TTL_SECONDS = 30;

async function loadPrincipal(userId: string, sessionId: string, issuedAtMs: number): Promise<Principal> {
  const cacheKey = `auth:${userId}:${sessionId}`;
  const cached = await cache.get<UserAuthRow>(cacheKey);

  let row = cached;
  if (!row) {
    const { rows } = await db().query<UserAuthRow>(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.tokens_valid_from
         FROM users u
         JOIN sessions s ON s.user_id = u.id
        WHERE u.id = $1 AND s.family_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
        LIMIT 1`,
      [userId, sessionId],
    );
    row = rows[0] ?? null;
    if (row) await cache.set(cacheKey, row, AUTH_CACHE_TTL_SECONDS);
  }

  // No row means the session was revoked, expired, or the user was deleted.
  if (!row) throw unauthenticated(ERROR_CODES.TOKEN_INVALID);

  if (row.status !== 'ACTIVE') {
    throw unauthenticated(ERROR_CODES.ACCOUNT_INACTIVE);
  }

  // A password change or forced sign-out bumps `tokens_valid_from`, which
  // invalidates access tokens minted before it even though they are unexpired.
  // Compared in milliseconds via the `ims` claim; see AccessTokenClaims.
  if (issuedAtMs < new Date(row.tokens_valid_from).getTime()) {
    throw unauthenticated(ERROR_CODES.TOKEN_INVALID, 'Your session ended. Please sign in again.');
  }

  return {
    id: row.id,
    role: row.role,
    sessionId,
    email: row.email,
    name: row.name,
    status: row.status,
  };
}

/** Drops cached auth state for a user, across all their sessions. */
export async function invalidateAuthCache(userId: string): Promise<void> {
  await dropAuthCache(userId);
}

/** Rejects the request unless it carries a valid access token. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerToken(req);
    if (!token) throw unauthenticated();
    const claims = await verifyAccessToken(token);
    req.user = await loadPrincipal(claims.sub, claims.sid, claims.ims);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Attaches the principal when a valid token is present, but allows the request
 * through either way. For endpoints whose response varies by viewer.
 */
export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerToken(req);
    if (token) {
      const claims = await verifyAccessToken(token);
      req.user = await loadPrincipal(claims.sub, claims.sid, claims.ims);
    }
  } catch {
    // An invalid token on an optional route is treated as anonymous.
  }
  next();
}

/** Narrowing accessor; throws rather than returning undefined. */
export function principal(req: Request): Principal {
  if (!req.user) throw unauthenticated();
  return req.user;
}

/**
 * Requires every listed permission.
 *
 * Note `_own` permissions authorize the *action*, not the record: a handler
 * holding `task:update_own` must still verify ownership before writing. See
 * `isOwnershipScoped` in the shared RBAC module.
 */
export function requirePermission(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(unauthenticated());
    const missing = required.filter((p) => !can(user.role, p));
    if (missing.length > 0) {
      return next(
        forbidden(undefined, { role: user.role, missing, granted: permissionsFor(user.role).length }),
      );
    }
    next();
  };
}

/** Requires at least one of the listed permissions. */
export function requireAnyPermission(...options: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(unauthenticated());
    if (!options.some((p) => can(user.role, p))) {
      return next(forbidden(undefined, { role: user.role, needsAnyOf: options }));
    }
    next();
  };
}

/** Role gate, for the few places a capability genuinely is role-shaped. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(unauthenticated());
    if (!roles.includes(user.role)) return next(forbidden());
    next();
  };
}
