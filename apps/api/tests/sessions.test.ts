import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { auth, bootTestApp, createUser, loginUser, resetRateLimits, shutdownTestApp } from './helpers.js';

/**
 * Session families.
 *
 * Regression suite for a bug found running the app end to end: rotating a
 * refresh token revoked the row the current access token was bound to, so every
 * refresh killed in-flight tokens and one tab's refresh signed out the others.
 */
describe('session families', () => {
  let app: Express;

  beforeAll(async () => {
    app = await bootTestApp();
    await createUser(app, { email: 'family@test.dev', name: 'Family' });
  });

  afterAll(shutdownTestApp);

  const refresh = (cookies: string, csrf: string) =>
    request(app).post('/api/v1/auth/refresh').set('Cookie', cookies).set('X-CSRF-Token', csrf);

  it('keeps an unexpired access token valid after its session rotates', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    await refresh(user.cookies, user.csrf).expect(200);

    // The token minted before the refresh still works.
    await request(app).get('/api/v1/auth/me').set(auth(user)).expect(200);
  });

  it('does not sign out a second tab when the first refreshes', async () => {
    await resetRateLimits();
    // Two independent sign-ins, as two browsers would have.
    const tabA = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    const tabB = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');

    await refresh(tabA.cookies, tabA.csrf).expect(200);
    await request(app).get('/api/v1/auth/me').set(auth(tabB)).expect(200);
    await request(app).get('/api/v1/auth/me').set(auth(tabA)).expect(200);
  });

  it('still ends the access token when the user logs out', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    await request(app).get('/api/v1/auth/me').set(auth(user)).expect(200);

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrf)
      .expect(204);

    await request(app).get('/api/v1/auth/me').set(auth(user)).expect(401);
  });

  it('ends a rotated family when its session is revoked from the list', async () => {
    await resetRateLimits();
    const target = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    const rotated = await refresh(target.cookies, target.csrf).expect(200);
    const newToken = rotated.body.accessToken as string;

    const viewer = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    const sessions = await request(app).get('/api/v1/auth/sessions').set(auth(viewer)).expect(200);

    // One entry per sign-in, not one per rotation.
    const ids = sessions.body.map((s: { id: string }) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    const other = sessions.body.find((s: { current: boolean }) => !s.current);
    for (const session of sessions.body.filter((s: { current: boolean }) => !s.current)) {
      await request(app).delete(`/api/v1/auth/sessions/${session.id}`).set(auth(viewer)).expect(204);
    }
    expect(other).toBeDefined();

    // Both the original and the rotated token for that sign-in are dead.
    await request(app).get('/api/v1/auth/me').set(auth(target)).expect(401);
    await request(app).get('/api/v1/auth/me').set({ Authorization: `Bearer ${newToken}` }).expect(401);
    // The viewer's own session is untouched.
    await request(app).get('/api/v1/auth/me').set(auth(viewer)).expect(200);
  });

  /** The cookie header after a refresh: the new refresh token, same CSRF cookie. */
  const withNewRefresh = (cookies: string, res: request.Response) => {
    const next = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('xs_rt='))!.split(';')[0]!;
    return cookies.split('; ').map((c) => (c.startsWith('xs_rt=') ? next : c)).join('; ');
  };

  it('recovers when a refresh response is lost (page reloaded mid-refresh)', async () => {
    // Regression: the Google sign-in page reloaded while its refresh was in
    // flight, the browser kept the old cookie, and the replay was treated as
    // theft — so every sign-in needed two attempts.
    await resetRateLimits();
    const user = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    await refresh(user.cookies, user.csrf).expect(200); // response "lost"
    const retry = await refresh(user.cookies, user.csrf).expect(200);
    await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${retry.body.accessToken}`).expect(200);

    // The retried session carries on normally.
    await refresh(withNewRefresh(user.cookies, retry), user.csrf).expect(200);
  });

  it('still revokes the whole family when a rotated token comes back after its successor was used', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    const first = await refresh(user.cookies, user.csrf).expect(200);
    // The legitimate holder moves on with the new token...
    await refresh(withNewRefresh(user.cookies, first), user.csrf).expect(200);
    // ...so the old one turning up again means two parties hold it: theft.
    await refresh(user.cookies, user.csrf).expect(401);
    await request(app).get('/api/v1/auth/me').set(auth(user)).expect(401);
  });

  it('treats a replay as theft once the grace period has passed', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    await refresh(user.cookies, user.csrf).expect(200);
    const { db } = await import('../src/db/index.js');
    await db().query(
      `UPDATE sessions SET revoked_at = now() - interval '2 minutes'
        WHERE user_id = (SELECT id FROM users WHERE email = 'family@test.dev') AND replaced_by IS NOT NULL`,
    );
    await refresh(user.cookies, user.csrf).expect(401);
    await request(app).get('/api/v1/auth/me').set(auth(user)).expect(401);
  });

  it('does not revive a signed-out session through the grace period', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'family@test.dev', 'Test-Password-42!xq');
    const first = await refresh(user.cookies, user.csrf).expect(200);
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', withNewRefresh(user.cookies, first))
      .set('X-CSRF-Token', user.csrf)
      .set('Authorization', `Bearer ${first.body.accessToken}`);
    await refresh(user.cookies, user.csrf).expect(401);
  });
});

describe('cookie attributes', () => {
  let app: Express;
  beforeAll(async () => {
    app = await bootTestApp();
    await createUser(app, { email: 'cookies@test.dev', name: 'Cookies' });
  });
  afterAll(shutdownTestApp);

  it('never issues SameSite=None without Secure, which browsers would drop', async () => {
    // supertest does not enforce browser cookie rules, so this asserts the
    // headers directly. Regression guard for a bug where every reload signed
    // the user out because the auth cookies were silently rejected.
    await resetRateLimits();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cookies@test.dev', password: 'Test-Password-42!xq' })
      .expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      if (/samesite=none/i.test(cookie)) expect(cookie).toMatch(/;\s*secure/i);
    }
    const refresh = cookies.find((c) => c.startsWith('xs_rt='))!;
    expect(refresh).toMatch(/httponly/i);
    expect(refresh).toMatch(/path=\/api\/v1\/auth/i);
  });
});

describe('remember me', () => {
  let app: Express;
  beforeAll(async () => {
    app = await bootTestApp();
    await createUser(app, { email: 'remember@test.dev', name: 'Remember' });
  });
  afterAll(shutdownTestApp);

  it('keeps the long lifetime across refresh rotation', async () => {
    await resetRateLimits();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'remember@test.dev', password: 'Test-Password-42!xq', rememberMe: true })
      .expect(200);
    const jar = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    const csrf = /xs_csrf=([^;]+)/.exec(jar)![1]!;

    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', jar)
      .set('X-CSRF-Token', csrf)
      .expect(200);

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set({ Authorization: `Bearer ${rotated.body.accessToken}` })
      .expect(200);
    const days = (new Date(sessions.body[0].expiresAt).getTime() - Date.now()) / 86_400_000;
    // Default is 7 days, remembered is 30; the rotated successor must keep 30.
    expect(days).toBeGreaterThan(25);
  });
});
