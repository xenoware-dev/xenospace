import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '@xenospace/shared';
import { AppError } from '../lib/errors.js';
import { CSRF_COOKIE, setCsrfCookie } from '../auth/tokens.js';
import { randomToken, timingSafeEqual } from '../auth/crypto.js';

/**
 * CSRF protection, double-submit cookie pattern.
 *
 * Only the refresh and logout endpoints actually need this. Every other mutating
 * route authenticates with a bearer token from memory, which a cross-site form
 * post cannot attach — so those are structurally immune. The refresh endpoint
 * is the exception precisely because it authenticates with a cookie the browser
 * sends automatically.
 */

const HEADER = 'x-csrf-token';

/** Methods that cannot change state, and so need no token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Issues the CSRF cookie, or re-sets the existing value to slide its expiry.
 * Sliding keeps it alive for as long as the user is active, so it can never
 * expire before a refresh token that is still being rotated.
 */
export function issueCsrfToken(req: Request, res: Response, next: NextFunction): void {
  const existing = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const valid = typeof existing === 'string' && /^[\w-]{16,64}$/.test(existing);
  setCsrfCookie(res, valid ? existing : randomToken(24));
  next();
}

/**
 * Requires the header to match the cookie.
 *
 * The comparison is constant-time, and both values must be present: treating a
 * missing cookie as a pass would make the whole check bypassable by clearing it.
 */
export function requireCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookie = (req.cookies as Record<string, string> | undefined)?.[CSRF_COOKIE];
  const header = req.get(HEADER);

  if (!cookie || !header || !timingSafeEqual(cookie, header)) {
    return next(new AppError(403, ERROR_CODES.CSRF_FAILED));
  }
  next();
}
