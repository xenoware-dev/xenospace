import type { NextFunction, Request, Response } from 'express';
import { cache } from '../cache/index.js';
import { env } from '../config/env.js';
import { rateLimited } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Rate limiting, backed by the shared cache so limits hold across instances.
 *
 * Built on the cache's atomic increment rather than express-rate-limit, because
 * the authentication endpoints need to key by email as well as IP, and to count
 * only failures — neither of which the stock middleware does cleanly.
 */

export interface RateLimitOptions {
  /** Window length in seconds. */
  windowSeconds: number;
  /** Requests permitted per window. */
  max: number;
  /** Bucket name, so limiters cannot collide in the keyspace. */
  bucket: string;
  /** Defaults to the client IP. */
  keyFor?: (req: Request) => string;
  /** When true, a 2xx/3xx response refunds the increment. */
  skipSuccessful?: boolean;
  message?: string;
}

/**
 * The client's address.
 *
 * `req.ip` is only trustworthy because `trust proxy` is configured explicitly;
 * left at Express's default, a client could spoof `X-Forwarded-For` and sidestep
 * every IP-keyed limit here.
 */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function rateLimit(options: RateLimitOptions) {
  const { windowSeconds, max, bucket, keyFor = clientIp, skipSuccessful = false, message } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `rl:${bucket}:${keyFor(req)}`;
    try {
      const hits = await cache.increment(key, windowSeconds);
      const remaining = Math.max(0, max - hits);

      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(remaining));

      if (hits > max) {
        const resetMs = await cache.ttl(key);
        const retryAfter = Math.ceil((resetMs || windowSeconds * 1000) / 1000);
        res.setHeader('RateLimit-Reset', String(retryAfter));
        logger.warn({ bucket, key: keyFor(req), hits, max }, 'rate limit exceeded');
        return next(rateLimited(retryAfter, message));
      }

      if (skipSuccessful) {
        // Refund on success so that legitimate traffic is effectively unlimited
        // and only failures consume the budget.
        res.on('finish', () => {
          if (res.statusCode < 400) {
            void cache.get<number>(key).then(async (current) => {
              if (typeof current === 'number' && current > 0) {
                await cache.set(key, current - 1, windowSeconds);
              }
            });
          }
        });
      }

      next();
    } catch (err) {
      // A cache outage must not take the API down with it. Failing open is the
      // deliberate choice; env validation is what guarantees Redis exists in
      // production, so this path is a degraded-mode safety net, not the plan.
      logger.error({ err, bucket }, 'rate limiter unavailable — allowing request');
      next();
    }
  };
}

/** Broad limiter applied to the whole API. */
export const globalLimiter = rateLimit({
  bucket: 'global',
  windowSeconds: Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000),
  max: env.RATE_LIMIT_MAX,
});

/**
 * Tight limiter for credential endpoints, keyed by IP *and* the submitted email
 * so neither a single address nor a single account can be hammered. Only
 * failures count against it.
 */
export const authLimiter = rateLimit({
  bucket: 'auth-ip',
  windowSeconds: 900,
  max: 30,
  skipSuccessful: true,
  message: 'Too many sign-in attempts from this address. Please wait and try again.',
});

export const authEmailLimiter = rateLimit({
  bucket: 'auth-email',
  windowSeconds: 900,
  max: 10,
  skipSuccessful: true,
  keyFor: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === 'string' ? email.trim().toLowerCase().slice(0, 254) : clientIp(req);
  },
  message: 'Too many sign-in attempts for this account. Please wait and try again.',
});

/** Password reset and invite sends, which cost email and can be used to spam. */
export const sensitiveActionLimiter = rateLimit({
  bucket: 'sensitive',
  windowSeconds: 3600,
  max: 10,
  message: 'Too many requests. Please try again later.',
});

/** Writes are more expensive than reads, so they get their own budget. */
export const writeLimiter = rateLimit({
  bucket: 'write',
  windowSeconds: 60,
  max: 120,
  keyFor: (req) => req.user?.id ?? clientIp(req),
});

export const uploadLimiter = rateLimit({
  bucket: 'upload',
  windowSeconds: 3600,
  max: 100,
  keyFor: (req) => req.user?.id ?? clientIp(req),
});
