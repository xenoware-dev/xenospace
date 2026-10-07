import { z } from 'zod';
import crypto from 'node:crypto';

/**
 * Environment contract. Parsed once at boot; a bad value aborts the process
 * rather than surfacing as a confusing runtime failure later.
 */

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Minimum entropy for a signing secret, in characters. */
const SECRET_MIN = 32;

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    HOST: z.string().default('0.0.0.0'),

    /** Public origin of the API itself, used to build OAuth redirect URIs. */
    API_URL: z.string().url().default('http://localhost:4000'),
    /** Public origin of the SPA, used for redirects and the default CORS allow-list. */
    WEB_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: csv,

    /**
     * Postgres connection string. Point this at Supabase in every real
     * environment. Left empty, the API falls back to an in-process PGlite
     * database so a fresh clone boots with no external service.
     */
    DATABASE_URL: z.string().optional(),
    DATABASE_SSL: bool(true),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /** Directory backing the PGlite fallback; `memory://` keeps it ephemeral. */
    PGLITE_PATH: z.string().default('./.pgdata'),

    /**
     * Comma-separated emails that are the team leads, and the only ones. When
     * set, every other account is a developer, no one else can be promoted,
     * and the "first account becomes team lead" bootstrap is off. Unset keeps
     * that bootstrap, which suits a fresh local install but not production.
     */
    ADMIN_EMAILS: z
      .string()
      .optional()
      .transform((v) => (v ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))
      .pipe(z.array(z.string().email('ADMIN_EMAILS must be comma-separated email addresses'))),

    /**
     * Who may create an account. `open`: anyone can register or sign in with
     * Google. `invite_only`: only addresses a team lead has added (or that are
     * in ADMIN_EMAILS) can get in; everyone else is turned away.
     */
    ACCESS: z.enum(['open', 'invite_only']).default('open'),
    /** Email + password sign-in. `false` makes Google the only way in. */
    PASSWORD_LOGIN: bool(true),

    /** Minutes between automatic GitHub syncs of every connected repository; 0 turns it off. */
    GITHUB_SYNC_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(10),

    /** Redis for rate limits, the Socket.IO adapter and caches. Optional in dev. */
    REDIS_URL: z.string().optional(),

    JWT_ACCESS_SECRET: z.string().min(SECRET_MIN),
    JWT_REFRESH_SECRET: z.string().min(SECRET_MIN),
    /** Encrypts repository access tokens at rest. Rotating it invalidates them. */
    ENCRYPTION_KEY: z.string().min(SECRET_MIN),
    /** Signs the double-submit CSRF cookie. */
    CSRF_SECRET: z.string().min(SECRET_MIN),

    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
    /** Refresh lifetime when the user ticked "remember me". */
    REFRESH_TOKEN_REMEMBER_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    JWT_ISSUER: z.string().default('xenospace'),
    JWT_AUDIENCE: z.string().default('xenospace-web'),

    /** Cookie domain; leave unset for host-only cookies. */
    COOKIE_DOMAIN: z.string().optional(),
    /** Set false only when the API is genuinely served over plain HTTP. */
    COOKIE_SECURE: bool(true),
    /**
     * SameSite for the auth cookies. `lax` is correct whenever the SPA and API
     * share a registrable domain (app.example.com + api.example.com, or one
     * origin behind a proxy) — "site" ignores subdomain and port. Use `none`
     * only for a genuinely cross-site deployment, which also requires Secure.
     */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    /** Supabase Storage, used for uploads when configured. */
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().default('xenospace'),
    /** Local directory used for uploads when Supabase Storage is not configured. */
    UPLOAD_DIR: z.string().default('./.uploads'),

    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(8),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Enables the `/api/v1/dev/*` helpers. Forced off in production. */
    ENABLE_DEV_ROUTES: bool(false),
    TRUST_PROXY: z.string().default('loopback'),
  })
  .superRefine((env, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (env.NODE_ENV === 'production') {
      if (!env.DATABASE_URL) {
        fail('DATABASE_URL', 'A Postgres connection string is required in production; the PGlite fallback is development-only.');
      }
      if (!env.REDIS_URL) {
        fail('REDIS_URL', 'Redis is required in production for shared rate limiting and multi-instance sockets.');
      }
      if (!env.COOKIE_SECURE) {
        fail('COOKIE_SECURE', 'Refresh cookies must be Secure in production.');
      }
      if (env.ENABLE_DEV_ROUTES) {
        fail('ENABLE_DEV_ROUTES', 'Development routes cannot be enabled in production.');
      }
      // A shared secret across purposes means one leak compromises all of them.
      const secrets = [env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET, env.ENCRYPTION_KEY, env.CSRF_SECRET];
      if (new Set(secrets).size !== secrets.length) {
        fail('JWT_ACCESS_SECRET', 'Each secret must be distinct; reusing one across purposes defeats key separation.');
      }
      for (const [key, value] of Object.entries({
        JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
        ENCRYPTION_KEY: env.ENCRYPTION_KEY,
        CSRF_SECRET: env.CSRF_SECRET,
      })) {
        if (/^(dev|test|change|secret|password|xenospace)/i.test(value)) {
          fail(key, 'Looks like a placeholder secret. Generate one with `openssl rand -hex 32`.');
        }
      }
    }

    // Browsers silently drop a SameSite=None cookie that is not Secure, which
    // breaks sign-in persistence with no error anywhere. Refuse to boot instead.
    if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
      fail('COOKIE_SAMESITE', 'SameSite=None requires COOKIE_SECURE=true; browsers reject it otherwise.');
    }

    if ((env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) || (!env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) {
      fail('GOOGLE_CLIENT_ID', 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither.');
    }
    if (!env.PASSWORD_LOGIN && !(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) {
      fail('PASSWORD_LOGIN', 'With password sign-in off, Google must be configured or nobody can sign in.');
    }
    if (env.SUPABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) {
      fail('SUPABASE_SERVICE_ROLE_KEY', 'Supabase Storage needs a service-role key.');
    }
  });

export type Env = z.infer<typeof schema>;

/**
 * Outside production, missing secrets are filled with per-boot random values so
 * a fresh clone runs immediately. The trade-off is explicit: restarting the dev
 * server invalidates existing tokens, which is the correct behaviour for a
 * secret nobody chose.
 */
function withDevDefaults(raw: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nodeEnv = raw.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') return raw;
  const gen = () => crypto.randomBytes(32).toString('hex');
  return {
    ...raw,
    JWT_ACCESS_SECRET: raw.JWT_ACCESS_SECRET ?? gen(),
    JWT_REFRESH_SECRET: raw.JWT_REFRESH_SECRET ?? gen(),
    ENCRYPTION_KEY: raw.ENCRYPTION_KEY ?? gen(),
    CSRF_SECRET: raw.CSRF_SECRET ?? gen(),
    COOKIE_SECURE: raw.COOKIE_SECURE ?? 'false',
  };
}

function load(): Env {
  const parsed = schema.safeParse(withDevDefaults(process.env));
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
    // Thrown before the logger exists, so this writes straight to stderr.
    console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';

/** Origins permitted by CORS. Explicit list wins; otherwise just the SPA. */
export const allowedOrigins: string[] = env.CORS_ORIGINS.length ? env.CORS_ORIGINS : [env.WEB_URL];

/** True when a real Postgres is configured, as opposed to the PGlite fallback. */
export const usingExternalPostgres = Boolean(env.DATABASE_URL);
