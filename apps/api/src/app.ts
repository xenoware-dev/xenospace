import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { allowedOrigins, env, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { requestContext, requireJsonContentType } from './middleware/context.js';
import { issueCsrfToken } from './middleware/csrf.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { apiRouter } from './routes.js';
import { cache } from './cache/index.js';
import { db } from './db/index.js';

export function createApp(): Express {
  const app = express();

  /**
   * Proxy trust is set explicitly rather than left at Express's default.
   * `req.ip` feeds every IP-keyed rate limit and the audit trail, and on the
   * default setting a client could spoof `X-Forwarded-For` and evade both.
   * `TRUST_PROXY` must name the real hop count or proxy for the deployment.
   */
  // A hop count must reach Express as a number: the string "2" is parsed as an
  // IP address list and rejected.
  app.set(
    'trust proxy',
    env.TRUST_PROXY === 'true' ? true : /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY,
  );
  // The framework version is not information a client needs.
  app.disable('x-powered-by');
  // Strict routing off, but query parsing pinned: the extended parser's
  // prototype-pollution surface is not worth the nested-object support.
  app.set('query parser', 'simple');
  app.set('etag', 'strong');

  app.use(
    helmet({
      /**
       * This API serves JSON, never HTML, so the CSP only has to be strict
       * enough that a browser rendering an error page cannot be made to run
       * anything. The SPA ships its own, stricter policy.
       */
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      // 180 days, subdomains included. Only meaningful over HTTPS, so it is
      // scoped to production where TLS is guaranteed.
      hsts: isProd ? { maxAge: 15_552_000, includeSubDomains: true, preload: false } : false,
      // Not applicable to a JSON API and deprecated in favour of CSP.
      xssFilter: false,
    }),
  );

  app.use(
    cors({
      /**
       * An explicit allow-list, and credentials are enabled — which is exactly
       * why the origin can never be reflected or wildcarded. A permissive CORS
       * policy plus cookies is how a cross-site read of authenticated responses
       * becomes possible.
       */
      origin(origin, callback) {
        // No Origin header: same-origin navigations, curl, server-to-server.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        logger.warn({ origin }, 'blocked a cross-origin request');
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
      maxAge: 86_400,
    }),
  );

  app.use(requestContext);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',
      // Query strings can carry one-time secrets (the OAuth code and state,
      // reset tokens). They are stripped from the logged request, which the
      // path-based redaction cannot do inside a URL string.
      serializers: {
        req: (req: { url?: string; query?: Record<string, unknown> } & Record<string, unknown>) => ({
          ...req,
          url: scrubUrl(req.url),
          query: scrubQuery(req.query),
        }),
      },
      // Health checks would otherwise dominate the log volume.
      autoLogging: { ignore: (req) => req.url === '/health' || req.url === '/health/live' },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(requireJsonContentType);
  /**
   * A body limit is a DoS control, not a convenience. 256 KB comfortably fits
   * the largest legitimate payload (a long knowledge-base note) while keeping
   * an unbounded POST from consuming server memory. Uploads bypass this and are
   * bounded separately by multer.
   */
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(issueCsrfToken);
  app.use(globalLimiter);

  /* --------------------------------------------------------------- liveness */

  // Liveness: is the process up. Must not touch dependencies, or a database
  // blip would get the container killed and restarted pointlessly.
  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  // Readiness: can this instance actually serve traffic.
  app.get('/health', async (_req, res) => {
    const checks: Record<string, string> = {};
    let healthy = true;
    try {
      await db().query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'unreachable';
      healthy = false;
    }
    checks.cache = cache.kind;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks,
      version: process.env.npm_package_version ?? '1.0.0',
    });
  });

  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Query parameters that are secrets and must not be logged. */
const SECRET_PARAMS = ['code', 'state', 'token', 'access_token', 'id_token'];

function scrubUrl(url: string | undefined): string | undefined {
  if (!url || !url.includes('?')) return url;
  const [path, search] = url.split('?', 2) as [string, string];
  const params = new URLSearchParams(search);
  for (const key of SECRET_PARAMS) if (params.has(key)) params.set(key, '[redacted]');
  return `${path}?${params.toString()}`;
}

function scrubQuery(query: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!query) return query;
  const out = { ...query };
  for (const key of SECRET_PARAMS) if (key in out) out[key] = '[redacted]';
  return out;
}
