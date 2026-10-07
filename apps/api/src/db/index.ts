import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { fromPackageRoot } from '../lib/paths.js';
import { env, isProd, isTest, usingExternalPostgres } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Database access.
 *
 * Two drivers sit behind one interface: node-postgres against Supabase (every
 * real environment) and PGlite in-process (a fresh clone, and the test suite).
 * Both speak real Postgres with `$n` placeholders, so queries and migrations are
 * written once and never forked per driver.
 */

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /**
   * Runs a multi-statement script with no parameters, used for migrations.
   * Separate from `query` because the extended protocol permits only one
   * command per prepared statement, so a `;`-delimited script must go through
   * the simple protocol instead.
   */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /**
   * Runs `fn` inside a transaction, committing on return and rolling back on
   * throw. The handle passed to `fn` is the *only* one that participates; using
   * the outer `db` inside the callback would silently run outside the
   * transaction, so handlers must always thread the argument through.
   */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** Resolves once the first connection succeeds; throws if the database is unreachable. */
  ready(): Promise<void>;
  readonly driver: 'postgres' | 'pglite';
}

/**
 * Anchors a relative PGlite directory to the api package root. This file lives
 * at `<pkg>/src/db/`, so the root is three levels up.
 */
function resolvePgliteDir(configured: string): string {
  return configured.startsWith('memory://') ? configured : fromPackageRoot(configured);
}

/** Logs slow statements so a missing index shows up before users feel it. */
const SLOW_QUERY_MS = 200;

function trace(sql: string, startedAt: number) {
  const ms = Date.now() - startedAt;
  if (ms >= SLOW_QUERY_MS) {
    logger.warn({ ms, sql: sql.replace(/\s+/g, ' ').slice(0, 240) }, 'slow query');
  }
}

/* ------------------------------------------------------------------ postgres */

async function createPostgres(): Promise<Database> {
  const { default: pg } = await import('pg');
  const { Pool, types } = pg;

  // Return DATE as the literal `YYYY-MM-DD` string rather than a Date shifted
  // into the server's timezone, which is how the API serialises date-only
  // columns and what the date inputs in the UI expect back.
  types.setTypeParser(1082, (v: string) => v);
  // BIGINT and NUMERIC come back as strings by default; counts and aggregates
  // are safely within Number range here, and the DTOs declare them as numbers.
  types.setTypeParser(20, (v: string) => Number(v));
  types.setTypeParser(1700, (v: string) => Number(v));

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // NAT gateways and mobile networks silently drop idle TCP; keepalive stops
    // a long transaction (the seed, a migration) losing its connection.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // If the client vanishes mid-transaction (crash, dropped network), the
    // server would otherwise hold its row locks indefinitely and block every
    // later write to those rows. No transaction here legitimately idles a minute.
    idle_in_transaction_session_timeout: 60_000,
    // Supabase's pooler terminates TLS with a certificate chain the default
    // verifier rejects; the connection is still encrypted.
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    application_name: 'xenospace-api',
  });

  pool.on('error', (err) => logger.error({ err }, 'idle postgres client error'));

  return {
    driver: 'postgres',
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const startedAt = Date.now();
      try {
        const res = await pool.query(sql, params as unknown[]);
        return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
      } finally {
        trace(sql, startedAt);
      }
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          async query<R>(sql: string, params: readonly unknown[] = []) {
            const res = await client.query(sql, params as unknown[]);
            return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
          },
          async exec(sql: string) {
            await client.query(sql);
          },
        };
        const out = await fn(tx);
        await client.query('COMMIT');
        return out;
      } catch (err) {
        // A failed ROLLBACK must not mask the error that caused it.
        await client.query('ROLLBACK').catch((e) => logger.error({ err: e }, 'rollback failed'));
        throw err;
      } finally {
        client.release();
      }
    },
    async ready() {
      const res = await pool.query('select 1 as ok');
      if (res.rows[0]?.ok !== 1) throw new Error('Unexpected response from Postgres health probe');
    },
    async close() {
      await pool.end();
    },
  };
}

/* -------------------------------------------------------------------- pglite */

async function createPglite(): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  // Tests get a throwaway in-memory database; dev persists so seeded data and
  // logins survive a restart.
  //
  // A relative PGLITE_PATH is resolved against the api package rather than the
  // current directory, so `npm run dev` from the repo root and from apps/api
  // open the same database instead of silently creating two.
  const dataDir = isTest ? 'memory://' : resolvePgliteDir(env.PGLITE_PATH);
  const releaseLock = dataDir.startsWith('memory://') ? () => undefined : acquireDirLock(dataDir);
  const pglite = await PGlite.create({ dataDir });

  // PGlite has no pool, so transactions are serialised through this chain to
  // stop concurrent requests interleaving BEGIN/COMMIT on the one connection.
  let queue: Promise<unknown> = Promise.resolve();
  const serialise = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    driver: 'pglite',
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const startedAt = Date.now();
      try {
        const res = await serialise(() => pglite.query<T>(sql, params as unknown[]));
        return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
      } finally {
        trace(sql, startedAt);
      }
    },
    async exec(sql: string) {
      await serialise(() => pglite.exec(sql));
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      return serialise(async () => {
        await pglite.exec('BEGIN');
        try {
          const tx: Queryable = {
            async query<R>(sql: string, params: readonly unknown[] = []) {
              const res = await pglite.query<R>(sql, params as unknown[]);
              return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
            },
            async exec(sql: string) {
              await pglite.exec(sql);
            },
          };
          const out = await fn(tx);
          await pglite.exec('COMMIT');
          return out;
        } catch (err) {
          await pglite.exec('ROLLBACK').catch((e) => logger.error({ err: e }, 'rollback failed'));
          throw err;
        }
      });
    },
    async ready() {
      await pglite.query('select 1');
    },
    async close() {
      await pglite.close();
      releaseLock();
    },
  };
}

/**
 * Single-process lock for the PGlite data directory.
 *
 * PGlite is an embedded database with no cross-process locking of its own, and
 * two processes writing the same directory corrupt it beyond repair. That
 * happened in practice: a second `npm run dev` opened and migrated the database
 * before failing to bind its port. This lock makes the second process refuse to
 * start instead. A lock left by a crashed process is detected by checking
 * whether its pid is still alive, and is taken over.
 */
export function acquireDirLock(dataDir: string): () => void {
  const lockPath = `${dataDir}.lock`;

  const holder = (): number | null => {
    try {
      const pid = Number.parseInt(readFileSync(lockPath, 'utf8'), 10);
      return Number.isFinite(pid) ? pid : null;
    } catch {
      return null;
    }
  };
  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM means it exists but belongs to someone else: still alive.
      return (err as NodeJS.ErrnoException).code === 'EPERM';
    }
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        try {
          if (holder() === process.pid) unlinkSync(lockPath);
        } catch {
          /* already gone */
        }
      };
      process.once('exit', release);
      return release;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const pid = holder();
      if (pid !== null && pid !== process.pid && alive(pid)) {
        throw new Error(
          `The local database is already in use by another process (pid ${pid}). ` +
            'Stop the other XenoSpace API, seed or migration first — two processes ' +
            'writing the same PGlite directory will corrupt it.',
        );
      }
      logger.warn({ lockPath, stalePid: pid }, 'removing stale local database lock');
      unlinkSync(lockPath);
    }
  }
  throw new Error(`Could not acquire the local database lock at ${lockPath}`);
}

let instance: Database | null = null;
let pending: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (instance) return instance;
  if (!pending) {
    pending = (async () => {
      if (usingExternalPostgres) {
        logger.info('connecting to postgres');
        instance = await createPostgres();
      } else {
        if (isProd) throw new Error('DATABASE_URL is required in production');
        logger.warn('DATABASE_URL not set — using in-process PGlite (development only)');
        instance = await createPglite();
      }
      await instance.ready();
      logger.info({ driver: instance.driver }, 'database ready');
      return instance;
    })();
  }
  return pending;
}

/**
 * Convenience accessor for code that runs after boot. Throws rather than
 * lazily connecting, so a missing `getDb()` during startup is loud.
 */
export function db(): Database {
  if (!instance) throw new Error('Database accessed before initialisation; await getDb() during boot');
  return instance;
}

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
    pending = null;
  }
}

/** Reset hook for the test suite. */
export function __resetDbForTests(): void {
  instance = null;
  pending = null;
}
