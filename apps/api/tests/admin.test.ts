import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { auth, bootTestApp, createUser, setRole, shutdownTestApp, type TestUser } from './helpers.js';
import { env } from '../src/config/env.js';

/**
 * ADMIN_EMAILS pins who the team lead is. Every route that can grant the role
 * is checked here, because one missed path is enough to escalate.
 */
describe('pinned team lead (ADMIN_EMAILS)', () => {
  const LEAD = 'lead@corp.dev';
  let app: Express;
  let first: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    (env as { ADMIN_EMAILS: string[] }).ADMIN_EMAILS = [LEAD];
    app = await bootTestApp();
    first = await createUser(app, { email: 'first@corp.dev', name: 'First Person' });
    other = await createUser(app, { email: 'other@corp.dev', name: 'Other Person' });
  });

  afterAll(async () => {
    (env as { ADMIN_EMAILS: string[] }).ADMIN_EMAILS = [];
    await shutdownTestApp();
  });

  it('does not make the first account a lead when a lead is pinned', () => {
    expect(first.role).toBe('DEVELOPER');
    expect(other.role).toBe('DEVELOPER');
  });

  it('refuses password sign-up for the pinned address, which would not prove the inbox', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Squatter', email: LEAD, password: 'Test-Password-42!xq', confirmPassword: 'Test-Password-42!xq' });
    expect(res.status).toBe(403);
  });

  it('will not promote or invite anyone else as a lead', async () => {
    // A lead that exists outside the list (e.g. set directly in the database).
    await setRole(first.id, 'ADMIN');

    await request(app)
      .put(`/api/v1/members/${other.id}/role`)
      .set(auth(first))
      .send({ role: 'ADMIN' })
      .expect(403);

    await request(app)
      .post('/api/v1/members/invitations')
      .set(auth(first))
      .send({ email: 'newlead@corp.dev', role: 'ADMIN' })
      .expect(403);

    // Developers can still be invited normally.
    await request(app)
      .post('/api/v1/members/invitations')
      .set(auth(first))
      .send({ email: 'newdev@corp.dev', role: 'DEVELOPER' })
      .expect(201);
  });

  it('reconciles stored roles: demotes unlisted leads, promotes the verified pinned one', async () => {
    const { db } = await import('../src/db/index.js');
    const { reconcileAdminRoles } = await import('../src/auth/adminPolicy.js');

    // An unverified row for the pinned address must not be promoted.
    await db().query(
      `INSERT INTO users (email, name, role, status, email_verified, avatar_color)
       VALUES ($1, 'Lead', 'DEVELOPER', 'ACTIVE', false, '#6366f1')`,
      [LEAD],
    );
    await reconcileAdminRoles(db());
    const roles = async () =>
      Object.fromEntries(
        (await db().query<{ email: string; role: string }>(`SELECT email, role FROM users`)).rows.map((r) => [r.email, r.role]),
      );
    expect((await roles())[LEAD]).toBe('DEVELOPER');
    expect((await roles())['first@corp.dev']).toBe('DEVELOPER');

    await db().query(`UPDATE users SET email_verified = true WHERE email = $1`, [LEAD]);
    await reconcileAdminRoles(db());
    const after = await roles();
    expect(after[LEAD]).toBe('ADMIN');
    expect(Object.values(after).filter((r) => r === 'ADMIN')).toHaveLength(1);

    // The demoted lead's existing token is no longer accepted.
    await request(app).get('/api/v1/auth/me').set(auth(first)).expect(401);
  });
});
