import { env, isProd } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Cache and counter store.
 *
 * Redis in production; an in-process Map when REDIS_URL is unset so a fresh
 * clone runs without it. The fallback is explicitly *not* production-safe —
 * counters would be per-instance, so rate limits would multiply by instance
 * count — which is why env validation requires REDIS_URL in production.
 */

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Clears every key under a prefix. Used to invalidate a user's auth entries. */
  deletePrefix(prefix: string): Promise<void>;
  /** Atomic increment returning the new value, with a TTL applied on first write. */
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Milliseconds until the key expires, or 0 when it has no expiry. */
  ttl(key: string): Promise<number>;
  readonly kind: 'redis' | 'memory';
  close(): Promise<void>;
}

/* -------------------------------------------------------------------- memory */

function createMemoryStore(): CacheStore {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();

  const live = (key: string) => {
    const hit = entries.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }
    return hit;
  };

  // Bounded sweep so an idle process does not accumulate expired keys forever.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, hit] of entries) if (hit.expiresAt <= now) entries.delete(key);
  }, 60_000);
  sweeper.unref();

  return {
    kind: 'memory',
    async get<T>(key: string) {
      return (live(key)?.value as T) ?? null;
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async delete(key: string) {
      entries.delete(key);
    },
    async deletePrefix(prefix: string) {
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    },
    async increment(key: string, ttlSeconds: number) {
      const hit = live(key);
      const next = ((hit?.value as number) ?? 0) + 1;
      // The TTL is set once, on creation, so a window does not slide forward
      // with every hit and never reset.
      entries.set(key, { value: next, expiresAt: hit?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
      return next;
    },
    async ttl(key: string) {
      const hit = live(key);
      return hit ? Math.max(0, hit.expiresAt - Date.now()) : 0;
    },
    async close() {
      clearInterval(sweeper);
      entries.clear();
    },
  };
}

/* --------------------------------------------------------------------- redis */

async function createRedisStore(url: string): Promise<CacheStore> {
  const { default: Redis } = await import('ioredis');
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    // Without a ceiling, a long outage produces an ever-growing backlog of
    // queued commands and a memory problem on top of the outage.
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });

  client.on('error', (err) => logger.error({ err }, 'redis error'));
  client.on('ready', () => logger.info('redis ready'));

  await client.connect();

  const prefix = 'xs:';
  const k = (key: string) => prefix + key;

  return {
    kind: 'redis',
    async get<T>(key: string) {
      const raw = await client.get(k(key));
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T, ttlSeconds: number) {
      await client.set(k(key), JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSeconds)));
    },
    async delete(key: string) {
      await client.del(k(key));
    },
    async deletePrefix(keyPrefix: string) {
      // SCAN rather than KEYS: KEYS blocks the server for the whole keyspace.
      const stream = client.scanStream({ match: `${prefix}${keyPrefix}*`, count: 200 });
      const batch: string[] = [];
      for await (const keys of stream as AsyncIterable<string[]>) {
        batch.push(...keys);
        if (batch.length >= 500) {
          await client.del(...batch.splice(0, batch.length));
        }
      }
      if (batch.length) await client.del(...batch);
    },
    async increment(key: string, ttlSeconds: number) {
      // INCR then a conditional EXPIRE, pipelined into one round trip. NX on the
      // expiry is what stops the window sliding on every request.
      const [[, count]] = (await client
        .multi()
        .incr(k(key))
        .expire(k(key), Math.max(1, Math.ceil(ttlSeconds)), 'NX')
        .exec()) as [[Error | null, number], [Error | null, number]];
      return count;
    },
    async ttl(key: string) {
      const ms = await client.pttl(k(key));
      return ms > 0 ? ms : 0;
    },
    async close() {
      await client.quit();
    },
  };
}

let store: CacheStore = createMemoryStore();

/** Connects Redis if configured. Falls back to memory outside production. */
export async function initCache(): Promise<CacheStore> {
  if (!env.REDIS_URL) {
    if (isProd) throw new Error('REDIS_URL is required in production');
    logger.warn('REDIS_URL not set — using in-process cache (development only)');
    return store;
  }
  try {
    store = await createRedisStore(env.REDIS_URL);
    logger.info('cache backed by redis');
  } catch (err) {
    // In production a missing Redis means rate limits are unenforceable
    // cluster-wide, so booting anyway would be a silent security regression.
    if (isProd) throw err;
    logger.error({ err }, 'redis unavailable — falling back to in-process cache');
  }
  return store;
}

/** Proxy so modules can import `cache` at load time, before init runs. */
export const cache: CacheStore = {
  get kind() {
    return store.kind;
  },
  get: (key) => store.get(key),
  set: (key, value, ttl) => store.set(key, value, ttl),
  delete: (key) => store.delete(key),
  deletePrefix: (prefix) => store.deletePrefix(prefix),
  increment: (key, ttl) => store.increment(key, ttl),
  ttl: (key) => store.ttl(key),
  close: () => store.close(),
} as CacheStore;

export async function closeCache(): Promise<void> {
  await store.close();
}
