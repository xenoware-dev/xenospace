import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { auth, bootTestApp, createUser, setRole, shutdownTestApp, type TestUser } from './helpers.js';
import { env } from '../src/config/env.js';

/*
 * Google is stubbed at the network edge only: the state is still parsed for
 * real, and the "code" names the profile Google would have returned.
 */
vi.mock('../src/auth/oauth/google.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/auth/oauth/google.js')>();
  return {
    ...real,
    googleEnabled: true,
    parseState: () => ({ nonce: 'n', verifier: 'v', next: '/dashboard', issuedAt: Date.now() }),
    exchangeCode: async (code: string) => ({
      providerUserId: `google-${code}`,
      email: code,
      emailVerified: true,
      name: code.split('@')[0],
      picture: null,
    }),
  };
});

type Mutable = { ACCESS: 'open' | 'invite_only'; PASSWORD_LOGIN: boolean; ADMIN_EMAILS: string[] };
const settings = env as unknown as Mutable;

const googleSignIn = (app: Express, email: string) =>
  request(app).get('/api/v1/auth/oauth/google/callback').query({ code: email, state: 'stubbed' });

describe('invite-only, Google-only access', () => {
  const LEAD = 'lead@corp.dev';
  let app: Express;
  let lead: TestUser;
  let projectId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    // Set up a lead and a project while sign-up is still open.
    lead = await createUser(app, { email: 'setup-lead@corp.dev', name: 'Setup Lead' });
    await setRole(lead.id, 'ADMIN');
    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth(lead))
      .send({ name: 'Apollo', key: 'APL', status: 'ACTIVE', color: '#6366f1' })
      .expect(201);
    projectId = project.body.id;

    settings.ACCESS = 'invite_only';
    settings.PASSWORD_LOGIN = false;
    settings.ADMIN_EMAILS = [LEAD];
  });

  afterAll(async () => {
    settings.ACCESS = 'open';
    settings.PASSWORD_LOGIN = true;
    settings.ADMIN_EMAILS = [];
    await shutdownTestApp();
  });

  it('turns away a Google account nobody added', async () => {
    const res = await googleSignIn(app, 'stranger@gmail.com');
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location as string);
    expect(to.pathname).toBe('/access-denied');
    expect(to.searchParams.get('reason')).toBe('not_invited');
    expect(to.searchParams.get('email')).toBe('stranger@gmail.com');
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => c.startsWith('xs_rt='))).toBe(false);
  });

  it('lets in an address the lead added, as a developer on the chosen projects', async () => {
    await request(app)
      .post('/api/v1/members/invitations')
      .set(auth(lead))
      .send({ email: 'Dev.Person@gmail.com', role: 'DEVELOPER', projectIds: [projectId] })
      .expect(201);

    const res = await googleSignIn(app, 'dev.person@gmail.com');
    expect(res.headers.location).toMatch(/\/auth\/callback/);

    const { db } = await import('../src/db/index.js');
    const { rows } = await db().query<{ role: string; on_project: boolean; accepted: boolean }>(
      `SELECT u.role,
              EXISTS (SELECT 1 FROM project_members m WHERE m.user_id = u.id AND m.project_id = $2) AS on_project,
              EXISTS (SELECT 1 FROM invitations i WHERE lower(i.email) = $1 AND i.accepted_at IS NOT NULL) AS accepted
         FROM users u WHERE lower(u.email) = $1`,
      ['dev.person@gmail.com', projectId],
    );
    expect(rows[0]).toEqual({ role: 'DEVELOPER', on_project: true, accepted: true });

    // Signing in again works without a fresh invitation.
    const again = await googleSignIn(app, 'dev.person@gmail.com');
    expect(again.headers.location).toMatch(/\/auth\/callback/);
  });

  it('lets the pinned lead in without an invitation, as the lead', async () => {
    const res = await googleSignIn(app, LEAD);
    expect(res.headers.location).toMatch(/\/auth\/callback/);
    const { db } = await import('../src/db/index.js');
    const { rows } = await db().query<{ role: string }>(`SELECT role FROM users WHERE email = $1`, [LEAD]);
    expect(rows[0]?.role).toBe('ADMIN');
  });

  it('refuses every password route when Google is the only way in', async () => {
    const body = { email: 'x@corp.dev', password: 'Test-Password-42!xq', confirmPassword: 'Test-Password-42!xq', name: 'X' };
    await request(app).post('/api/v1/auth/login').send(body).expect(403);
    await request(app).post('/api/v1/auth/register').send(body).expect(403);
    await request(app).post('/api/v1/auth/forgot-password').send({ email: body.email }).expect(403);

    const providers = await request(app).get('/api/v1/auth/providers').expect(200);
    expect(providers.body).toMatchObject({ password: false, registration: false, leadPinned: true });
  });

  it('closes self-service sign-up when invite-only even with passwords on', async () => {
    settings.PASSWORD_LOGIN = true;
    try {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Walk In', email: 'walkin@corp.dev', password: 'Test-Password-42!xq', confirmPassword: 'Test-Password-42!xq' });
      expect(res.status).toBe(403);
    } finally {
      settings.PASSWORD_LOGIN = false;
    }
  });
});
