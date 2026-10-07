import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '@xenospace/shared';
import { createApp } from '../src/app.js';
import { getDb, closeDb } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { initCache, cache } from '../src/cache/index.js';

export interface TestUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  token: string;
  /** Cookie header value carrying the refresh and CSRF cookies. */
  cookies: string;
  csrf: string;
}

let app: Express | null = null;

/** Boots the app once per test file against a fresh in-memory database. */
export async function bootTestApp(): Promise<Express> {
  if (app) return app;
  await getDb();
  await migrate();
  await initCache();
  app = createApp();
  return app;
}

export async function shutdownTestApp(): Promise<void> {
  await closeDb();
  app = null;
}

/** Clears rate-limit counters so one test's attempts do not throttle the next. */
export async function resetRateLimits(): Promise<void> {
  await cache.deletePrefix('rl:');
}

function parseCookies(raw: string[] | undefined): { header: string; csrf: string } {
  const jar = raw ?? [];
  const header = jar.map((c) => c.split(';')[0]).join('; ');
  const csrfCookie = jar.find((c) => c.startsWith('xs_csrf='));
  const csrf = csrfCookie?.split(';')[0]?.split('=')[1] ?? '';
  return { header, csrf };
}

/**
 * Registers a user and returns their credentials and tokens.
 *
 * The first account created in a fresh database becomes ADMIN, which is the
 * server's bootstrap rule — so the order of calls matters and the returned
 * `role` is what the server actually granted, not what was asked for.
 */
export async function createUser(
  app: Express,
  overrides: { name?: string; email: string; password?: string } = { email: 'user@test.dev' },
): Promise<TestUser> {
  const password = overrides.password ?? 'Test-Password-42!xq';
  const name = overrides.name ?? 'Test User';

  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email: overrides.email, password, confirmPassword: password })
    .expect(201);

  const { header, csrf } = parseCookies(res.headers['set-cookie'] as unknown as string[]);
  return {
    id: res.body.user.id,
    name,
    email: overrides.email,
    password,
    role: res.body.user.role,
    token: res.body.accessToken,
    cookies: header,
    csrf,
  };
}

/** Signs in an existing user, returning fresh tokens. */
export async function loginUser(app: Express, email: string, password: string): Promise<TestUser> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login for ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const { header, csrf } = parseCookies(res.headers['set-cookie'] as unknown as string[]);
  return {
    id: res.body.user.id,
    name: res.body.user.name,
    email,
    password,
    role: res.body.user.role,
    token: res.body.accessToken,
    cookies: header,
    csrf,
  };
}

/** Promotes a user directly in the database, for arranging test fixtures. */
export async function setRole(userId: string, role: Role): Promise<void> {
  const { db } = await import('../src/db/index.js');
  await db().query(`UPDATE users SET role = $2 WHERE id = $1`, [userId, role]);
  const { invalidateAuthCache } = await import('../src/middleware/authenticate.js');
  await invalidateAuthCache(userId);
}

export const auth = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
