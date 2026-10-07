import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { bootTestApp, createUser, loginUser, resetRateLimits, shutdownTestApp, auth } from './helpers.js';

describe('authentication', () => {
  let app: Express;
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    app = await bootTestApp();
    // First account in an empty workspace bootstraps as the team lead.
    admin = await createUser(app, { email: 'lead@test.dev', name: 'Lead' });
  });

  afterAll(shutdownTestApp);

  it('makes the first account a team lead and later accounts developers', async () => {
    expect(admin.role).toBe('ADMIN');
    const dev = await createUser(app, { email: 'dev1@test.dev', name: 'Dev One' });
    expect(dev.role).toBe('DEVELOPER');
  });

  it('refuses a role supplied in the registration body', async () => {
    const password = 'Escalate-Me-99!xq';
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Climber', email: 'climber@test.dev',
        password, confirmPassword: password,
        role: 'ADMIN', permissions: ['audit:read'], status: 'ACTIVE',
      })
      .expect(201);
    // The server decides the role; the body is ignored.
    expect(res.body.user.role).toBe('DEVELOPER');
  });

  it('rejects passwords that fail policy', async () => {
    for (const password of ['short', 'alllowercase123!', 'NOUPPERORSYMBOL123', 'Aaaa1111!aaaa']) {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Weak', email: `w${Math.random()}@test.dev`, password, confirmPassword: password });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('treats email as case-insensitive and unique', async () => {
    const password = 'Duplicate-Me-77!xq';
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Dup', email: 'LEAD@TEST.DEV', password, confirmPassword: password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('never reveals whether an email exists', async () => {
    await resetRateLimits();
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.dev', password: 'Wrong-Password-11!xq' });
    const known = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lead@test.dev', password: 'Wrong-Password-11!xq' });

    // Identical status and code for both, so neither distinguishes the cases.
    expect(unknown.status).toBe(401);
    expect(known.status).toBe(401);
    expect(unknown.body.error.code).toBe('CREDENTIALS_INVALID');
    expect(known.body.error.code).toBe('CREDENTIALS_INVALID');
    expect(unknown.body.error.message).toBe(known.body.error.message);
  });

  it('never returns a password hash or TOTP secret', async () => {
    const res = await request(app).get('/api/v1/auth/me').set(auth(admin)).expect(200);
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/argon2/i);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('totpSecret');
    expect(res.body).not.toHaveProperty('totp_secret');
  });

  it('rejects a missing, malformed or tampered access token', async () => {
    await request(app).get('/api/v1/auth/me').expect(401);
    await request(app).get('/api/v1/auth/me').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
    await request(app).get('/api/v1/auth/me').set({ Authorization: admin.token }).expect(401);

    const tampered = `${admin.token.slice(0, -4)}AAAA`;
    const res = await request(app).get('/api/v1/auth/me').set({ Authorization: `Bearer ${tampered}` });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects a token signed with the wrong key', async () => {
    const { SignJWT } = await import('jose');
    const forged = await new SignJWT({ role: 'ADMIN', sid: crypto.randomUUID() })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuedAt()
      .setIssuer('xenospace')
      .setAudience('xenospace-web')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('an-attacker-chosen-secret-32-chars!!'));

    const res = await request(app).get('/api/v1/auth/me').set({ Authorization: `Bearer ${forged}` });
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned "alg: none" token', async () => {
    // A verifier that honours the header's algorithm would accept this.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: admin.id, role: 'ADMIN', sid: crypto.randomUUID(),
        iss: 'xenospace', aud: 'xenospace-web', exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString('base64url');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set({ Authorization: `Bearer ${header}.${payload}.` });
    expect(res.status).toBe(401);
  });

  it('locks an account after repeated failures and keeps it locked for a correct password', async () => {
    await resetRateLimits();
    const victim = await createUser(app, { email: 'victim@test.dev', name: 'Victim' });

    // LOGIN_MAX_ATTEMPTS is 4 in tests.
    for (let i = 1; i <= 3; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: victim.email, password: `Wrong-Attempt-${i}!xq` });
      expect(res.status).toBe(401);
    }
    const locking = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: victim.email, password: 'Wrong-Attempt-4!xq' });
    expect(locking.status).toBe(423);
    expect(locking.body.error.code).toBe('ACCOUNT_LOCKED');

    // The correct password must not bypass the lock.
    const correct = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: victim.email, password: victim.password });
    expect(correct.status).toBe(423);
  });

  it('records failed attempts durably rather than rolling them back', async () => {
    // Regression guard: the failure counter and audit rows were once written
    // inside the transaction that then threw, so both were discarded and the
    // lockout never fired.
    const { db } = await import('../src/db/index.js');
    const attempts = await db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM login_attempts WHERE successful = false AND reason = 'BAD_PASSWORD'`,
    );
    expect(attempts.rows[0]!.n).toBeGreaterThan(0);

    const audits = await db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE action = 'auth.login' AND outcome = 'FAILURE'`,
    );
    expect(audits.rows[0]!.n).toBeGreaterThan(0);
  });

  it('keeps lockout scoped to the targeted account', async () => {
    await resetRateLimits();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lead@test.dev', password: admin.password });
    expect(res.status).toBe(200);
  });
});

describe('sessions and refresh rotation', () => {
  let app: Express;

  beforeAll(async () => {
    app = await bootTestApp();
    await createUser(app, { email: 'owner@test.dev', name: 'Owner' });
  });

  afterAll(shutdownTestApp);

  it('requires a CSRF header to refresh', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'owner@test.dev', 'Test-Password-42!xq');
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', user.cookies);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects a CSRF header that does not match the cookie', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'owner@test.dev', 'Test-Password-42!xq');
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', 'a-different-value');
    expect(res.status).toBe(403);
  });

  it('rotates the refresh token and revokes the family when one is reused', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'owner@test.dev', 'Test-Password-42!xq');

    const first = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrf)
      .expect(200);
    expect(first.body.accessToken).toBeTruthy();

    const rotated = (first.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    // The token actually changed, rather than being reissued unchanged.
    expect(rotated).not.toBe(user.cookies);

    // Replaying the consumed token is treated as theft once the short grace
    // period for lost responses (see sessions.test.ts) has passed.
    const { db } = await import('../src/db/index.js');
    await db().query(
      `UPDATE sessions SET revoked_at = now() - interval '2 minutes'
        WHERE user_id = $1 AND replaced_by IS NOT NULL`,
      [user.id],
    );
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', user.cookies)
      .set('X-CSRF-Token', user.csrf);
    expect(replay.status).toBe(401);

    // And the legitimate successor is revoked along with it.
    const successor = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${rotated}; xs_csrf=${user.csrf}`)
      .set('X-CSRF-Token', user.csrf);
    expect(successor.status).toBe(401);
  });

  it('invalidates existing access tokens when the password changes', async () => {
    await resetRateLimits();
    const user = await loginUser(app, 'owner@test.dev', 'Test-Password-42!xq');
    await request(app).get('/api/v1/auth/me').set(auth(user)).expect(200);

    const next = 'Rotated-Password-55!xq';
    await request(app)
      .post('/api/v1/auth/change-password')
      .set(auth(user))
      .send({ currentPassword: user.password, password: next, confirmPassword: next })
      .expect(204);

    // tokens_valid_from has moved past this token's issued-at.
    const after = await request(app).get('/api/v1/auth/me').set(auth(user));
    expect(after.status).toBe(401);

    // Restore for any later test in this file.
    await resetRateLimits();
    await request(app).post('/api/v1/auth/login').send({ email: 'owner@test.dev', password: next }).expect(200);
  });

  it('does not let one user revoke another user\'s session', async () => {
    await resetRateLimits();
    const intruder = await createUser(app, { email: 'intruder@test.dev', name: 'Intruder' });
    const target = await loginUser(app, 'owner@test.dev', 'Rotated-Password-55!xq');

    const sessions = await request(app).get('/api/v1/auth/sessions').set(auth(target)).expect(200);
    const targetSessionId = sessions.body[0].id;

    // Scoped by user_id, so this is a no-op rather than a cross-user revoke.
    await request(app)
      .delete(`/api/v1/auth/sessions/${targetSessionId}`)
      .set(auth(intruder))
      .expect(204);

    await request(app).get('/api/v1/auth/me').set(auth(target)).expect(200);
  });
});

describe('google oauth callback', () => {
  let app: Express;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(shutdownTestApp);

  it('sends a user who cancels on the consent screen back to login', async () => {
    const res = await request(app).get('/api/v1/auth/oauth/google/callback').query({ error: 'access_denied' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login\?error=oauth_cancelled$/);
  });

  it('turns a forged or tampered state into a login error, not a raw failure', async () => {
    const res = await request(app)
      .get('/api/v1/auth/oauth/google/callback')
      .query({ code: 'anything', state: 'eyJmb28iOiJiYXIifQ.forged-signature' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login\?error=oauth_failed$/);
    // No session may be issued on a failed callback.
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('xs_rt='))).toBe(false);
  });
});
