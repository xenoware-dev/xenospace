import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { auth, bootTestApp, createUser, resetRateLimits, shutdownTestApp, type TestUser } from './helpers.js';

/**
 * Authorization.
 *
 * Two distinct failures are covered. *Vertical* escalation is a developer
 * reaching an admin capability. *Horizontal* escalation is a developer reaching
 * another project's data — the one that actually leaks customer data, and the
 * one a role check alone does not prevent.
 */
describe('authorization', () => {
  let app: Express;
  let lead: TestUser;
  let insider: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    lead = await createUser(app, { email: 'tl@test.dev', name: 'Team Lead' });
    insider = await createUser(app, { email: 'insider@test.dev', name: 'Insider' });
    outsider = await createUser(app, { email: 'outsider@test.dev', name: 'Outsider' });

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth(lead))
      .send({
        name: 'Apollo', key: 'APL', description: 'Confidential programme',
        status: 'ACTIVE', color: '#6366f1',
        memberIds: [insider.id],
      })
      .expect(201);
    projectId = project.body.id;

    const task = await request(app)
      .post('/api/v1/tasks')
      .set(auth(lead))
      .send({ projectId, title: 'Wire up billing', type: 'FEATURE', priority: 'HIGH', assigneeId: insider.id })
      .expect(201);
    taskId = task.body.id;
  });

  afterAll(shutdownTestApp);

  describe('vertical escalation', () => {
    it('denies a developer the ability to create a project', async () => {
      const res = await request(app)
        .post('/api/v1/projects')
        .set(auth(insider))
        .send({ name: 'Rogue', key: 'RGE', status: 'ACTIVE', color: '#ef4444' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('denies a developer the ability to delete a project or task', async () => {
      await request(app).delete(`/api/v1/projects/${projectId}`).set(auth(insider)).expect(403);
      await request(app).delete(`/api/v1/tasks/${taskId}`).set(auth(insider)).expect(403);
    });

    it('denies a developer the ability to reassign a task', async () => {
      // Reassignment needs task:assign, which a developer does not hold — even
      // on a task assigned to them.
      await request(app)
        .post(`/api/v1/tasks/${taskId}/assign`)
        .set(auth(insider))
        .send({ assigneeId: outsider.id })
        .expect(403);

      const viaPatch = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set(auth(insider))
        .send({ assigneeId: outsider.id });
      expect(viaPatch.status).toBe(403);
    });

    it('lets a developer edit a task assigned to them', async () => {
      const res = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set(auth(insider))
        .send({ description: 'Investigated; needs a webhook.' })
        .expect(200);
      expect(res.body.description).toBe('Investigated; needs a webhook.');
    });

    it('reports the permission set the role actually holds', async () => {
      const devRes = await request(app).get('/api/v1/auth/me').set(auth(insider)).expect(200);
      const leadRes = await request(app).get('/api/v1/auth/me').set(auth(lead)).expect(200);

      expect(devRes.body.permissions).not.toContain('project:create');
      expect(devRes.body.permissions).not.toContain('task:assign');
      expect(devRes.body.permissions).not.toContain('audit:read');
      expect(devRes.body.permissions).toContain('task:update_own');
      expect(leadRes.body.permissions).toContain('project:create');
      expect(leadRes.body.permissions.length).toBeGreaterThan(devRes.body.permissions.length);
    });
  });

  describe('horizontal escalation / tenant isolation', () => {
    it('hides a project from a developer who is not a member', async () => {
      const list = await request(app).get('/api/v1/projects').set(auth(outsider)).expect(200);
      expect(list.body.items).toHaveLength(0);

      const insiderList = await request(app).get('/api/v1/projects').set(auth(insider)).expect(200);
      expect(insiderList.body.items).toHaveLength(1);
    });

    it('returns 404 rather than 403 for a project the caller may not see', async () => {
      // A 403 would confirm the id exists, which is enough to enumerate it.
      const res = await request(app).get(`/api/v1/projects/${projectId}`).set(auth(outsider));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('hides tasks belonging to an unrelated project', async () => {
      const list = await request(app).get('/api/v1/tasks').set(auth(outsider)).expect(200);
      expect(list.body.items).toHaveLength(0);

      const direct = await request(app).get(`/api/v1/tasks/${taskId}`).set(auth(outsider));
      expect(direct.status).toBe(404);
    });

    it('does not let a non-member write to a task via any route', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set(auth(outsider))
        .send({ title: 'Defaced' })
        .expect(404);

      await request(app)
        .post(`/api/v1/tasks/${taskId}/move`)
        .set(auth(outsider))
        .send({ status: 'DONE', position: 1 })
        .expect(404);

      await request(app)
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set(auth(outsider))
        .send({ body: 'Leaking into this thread', mentions: [] })
        .expect(404);

      // Confirm nothing actually changed.
      const check = await request(app).get(`/api/v1/tasks/${taskId}`).set(auth(lead)).expect(200);
      expect(check.body.title).toBe('Wire up billing');
    });

    it('keeps a project filter from bypassing scope', async () => {
      // Explicitly asking for the project id must not widen visibility.
      const res = await request(app)
        .get('/api/v1/tasks')
        .query({ projectId })
        .set(auth(outsider))
        .expect(200);
      expect(res.body.items).toHaveLength(0);
    });

    it('scopes the board to the caller', async () => {
      const outsiderBoard = await request(app)
        .get('/api/v1/tasks/board')
        .query({ projectId })
        .set(auth(outsider));
      // The project is invisible, so asking for its board is a 404.
      expect(outsiderBoard.status).toBe(404);

      const insiderBoard = await request(app)
        .get('/api/v1/tasks/board')
        .query({ projectId })
        .set(auth(insider))
        .expect(200);
      expect(insiderBoard.body.TODO).toHaveLength(1);
    });

    it('lets a team lead see everything', async () => {
      const list = await request(app).get('/api/v1/projects').set(auth(lead)).expect(200);
      expect(list.body.items).toHaveLength(1);
      await request(app).get(`/api/v1/tasks/${taskId}`).set(auth(lead)).expect(200);
    });
  });

  describe('input handling', () => {
    it('strips unknown fields rather than persisting them', async () => {
      // Mass assignment: the schema drops keys it does not declare, so these
      // never reach the UPDATE statement.
      await request(app)
        .patch(`/api/v1/projects/${projectId}`)
        .set(auth(lead))
        .send({ name: 'Apollo II', key: 'HACKED', taskCounter: 9999, createdBy: outsider.id, id: outsider.id })
        .expect(200);

      const res = await request(app).get(`/api/v1/projects/${projectId}`).set(auth(lead)).expect(200);
      expect(res.body.name).toBe('Apollo II');
      // The immutable key is untouched.
      expect(res.body.key).toBe('APL');
      expect(res.body.id).toBe(projectId);
    });

    it('treats SQL metacharacters in filters as data', async () => {
      const payloads = [
        "'; DROP TABLE tasks; --",
        "' OR '1'='1",
        "') OR 1=1 --",
        "1; DELETE FROM users WHERE 1=1; --",
      ];
      for (const q of payloads) {
        const res = await request(app).get('/api/v1/tasks').query({ q }).set(auth(lead));
        expect(res.status).toBe(200);
        // Treated as a search string, matching nothing.
        expect(res.body.items).toHaveLength(0);
      }
      // The table is still there and intact.
      const after = await request(app).get('/api/v1/tasks').set(auth(lead)).expect(200);
      expect(after.body.items).toHaveLength(1);
    });

    it('reads a boolean query flag of "false" as false', async () => {
      // z.coerce.boolean() would turn the string "false" into true.
      const all = await request(app).get('/api/v1/tasks').query({ projectId, pageSize: 100 }).set(auth(lead)).expect(200);
      const notOverdue = await request(app)
        .get('/api/v1/tasks')
        .query({ projectId, pageSize: 100, overdue: 'false' })
        .set(auth(lead))
        .expect(200);
      expect(notOverdue.body.total).toBe(all.body.total);
      await request(app).get('/api/v1/tasks').query({ overdue: 'maybe' }).set(auth(lead)).expect(400);
    });

    it('rejects an unknown sort column instead of interpolating it', async () => {
      const res = await request(app)
        .get('/api/v1/tasks')
        .query({ sort: 'title; DROP TABLE tasks' })
        .set(auth(lead));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a malformed uuid in the path', async () => {
      const res = await request(app).get('/api/v1/tasks/not-a-uuid').set(auth(lead));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('bounds pagination so a client cannot demand the whole table', async () => {
      const res = await request(app).get('/api/v1/tasks').query({ pageSize: 10_000 }).set(auth(lead));
      expect(res.status).toBe(400);
    });

    it('rejects an oversized body', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId, title: 'Huge', description: 'x'.repeat(300_000) });
      expect([400, 413]).toContain(res.status);
    });

    it('rejects a non-JSON body on a write', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .set('Content-Type', 'text/plain')
        .send('projectId=x&title=y');
      expect(res.status).toBe(415);
    });
  });

  describe('workflow rules', () => {
    it('refuses an illegal status transition', async () => {
      const task = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId, title: 'Transition probe', status: 'BACKLOG' })
        .expect(201);

      // BACKLOG may only move to TODO; jumping to DONE would skip review.
      const res = await request(app)
        .post(`/api/v1/tasks/${task.body.id}/move`)
        .set(auth(lead))
        .send({ status: 'DONE', position: 1 });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('ILLEGAL_TRANSITION');
    });

    it('will not release a blocked task while its blockers are open', async () => {
      const blocker = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId, title: 'Blocking work', status: 'TODO' })
        .expect(201);

      const blocked = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId, title: 'Blocked work', status: 'TODO', blockedByIds: [blocker.body.id] })
        .expect(201);

      await request(app)
        .post(`/api/v1/tasks/${blocked.body.id}/move`)
        .set(auth(lead))
        .send({ status: 'BLOCKED', position: 1 })
        .expect(200);

      const premature = await request(app)
        .post(`/api/v1/tasks/${blocked.body.id}/move`)
        .set(auth(lead))
        .send({ status: 'IN_PROGRESS', position: 1 });
      expect(premature.status).toBe(409);

      // Clear the blocker, then the move is allowed.
      await request(app)
        .post(`/api/v1/tasks/${blocker.body.id}/move`)
        .set(auth(lead))
        .send({ status: 'IN_PROGRESS', position: 1 })
        .expect(200);
      await request(app)
        .post(`/api/v1/tasks/${blocker.body.id}/move`)
        .set(auth(lead))
        .send({ status: 'DONE', position: 1 })
        .expect(200);

      await request(app)
        .post(`/api/v1/tasks/${blocked.body.id}/move`)
        .set(auth(lead))
        .send({ status: 'IN_PROGRESS', position: 1 })
        .expect(200);
    });

    it('refuses to assign someone who is not on the project', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId, title: 'Bad assignee', assigneeId: outsider.id });
      expect(res.status).toBe(400);
    });

    it('rejects a story-point estimate outside the Fibonacci set', async () => {
      const res = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId, title: 'Odd estimate', estimate: 7 });
      expect(res.status).toBe(400);
    });

    it('issues sequential, project-scoped references', async () => {
      const list = await request(app)
        .get('/api/v1/tasks')
        .query({ projectId, pageSize: 100 })
        .set(auth(lead))
        .expect(200);
      const refs: string[] = list.body.items.map((t: { reference: string }) => t.reference);
      expect(refs.every((r) => r.startsWith('APL-'))).toBe(true);
      // Unique, which is what the counter-in-one-statement approach guarantees.
      expect(new Set(refs).size).toBe(refs.length);
    });

    it('denies a developer creating a task already assigned to someone else', async () => {
      // Creating pre-assigned work is reassignment by another route.
      const other = await request(app)
        .post('/api/v1/tasks')
        .set(auth(insider))
        .send({ projectId, title: 'Hand-off by creation', assigneeId: lead.id });
      expect(other.status).toBe(403);

      const self = await request(app)
        .post('/api/v1/tasks')
        .set(auth(insider))
        .send({ projectId, title: 'Picking this up myself', assigneeId: insider.id })
        .expect(201);
      expect(self.body.assignee.id).toBe(insider.id);
    });

    it('will not link a blocker or parent from a project the caller cannot see', async () => {
      // The blocker's title and status come back with the task, so a foreign
      // id must be refused rather than stored and echoed.
      const secretProject = await request(app)
        .post('/api/v1/projects')
        .set(auth(lead))
        .send({ name: 'Hermes', key: 'HRM', status: 'ACTIVE', color: '#22c55e' })
        .expect(201);
      const secret = await request(app)
        .post('/api/v1/tasks')
        .set(auth(lead))
        .send({ projectId: secretProject.body.id, title: 'Acquisition due diligence' })
        .expect(201);

      const onCreate = await request(app)
        .post('/api/v1/tasks')
        .set(auth(insider))
        .send({ projectId, title: 'Probe via create', blockedByIds: [secret.body.id] });
      expect(onCreate.status).toBe(400);

      const onUpdate = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set(auth(insider))
        .send({ blockedByIds: [secret.body.id] });
      expect(onUpdate.status).toBe(400);

      const asParent = await request(app)
        .patch(`/api/v1/tasks/${taskId}`)
        .set(auth(insider))
        .send({ parentTaskId: secret.body.id });
      expect(asParent.status).toBe(400);

      const after = await request(app).get(`/api/v1/tasks/${taskId}`).set(auth(insider)).expect(200);
      expect(JSON.stringify(after.body)).not.toContain('Acquisition');
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated failed sign-ins from one address', async () => {
      await resetRateLimits();
      let limited = false;
      for (let i = 0; i < 40; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: `probe${i}@test.dev`, password: 'Wrong-Password-11!xq' });
        if (res.status === 429) {
          expect(res.headers['retry-after']).toBeDefined();
          limited = true;
          break;
        }
      }
      expect(limited).toBe(true);
      await resetRateLimits();
    });
  });
});
