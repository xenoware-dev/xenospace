import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { auth, bootTestApp, createUser, setRole, shutdownTestApp, type TestUser } from './helpers.js';
import { mentionedTaskNumbers, syncRepository } from '../src/modules/repos/repos.sync.js';

/*
 * GitHub is replaced at the network edge with canned GraphQL responses; the
 * client, the sync and the database writes all run for real.
 */
const TOKEN = 'github_pat_test_token_value_123456';
let prState: 'OPEN' | 'MERGED' = 'OPEN';
let tokenValid = true;

function githubResponse(query: string): unknown {
  if (query.includes('query Branches')) {
    return {
      data: {
        repository: {
          refs: {
            nodes: [
              { name: 'main', target: { committedDate: '2026-10-01T10:00:00Z', author: { name: 'Lead', user: { login: 'lead-gh' } } }, compare: { aheadBy: 0, behindBy: 0 } },
              // Default branch is 2 commits ahead of this one; this one has 3 of its own.
              { name: 'feature/APL-1-login', target: { committedDate: '2026-10-02T10:00:00Z', author: { name: 'Stranger', user: { login: 'stranger' } } }, compare: { aheadBy: 2, behindBy: 3 } },
            ],
          },
        },
      },
    };
  }
  return {
    data: {
      repository: {
        name: 'apollo', nameWithOwner: 'acme/apollo', url: 'https://github.com/acme/apollo', isPrivate: true,
        defaultBranchRef: {
          name: 'main',
          target: {
            history: {
              nodes: [
                { oid: 'a'.repeat(40), message: 'Fix login redirect (APL-1)\n\nDetails', committedDate: '2026-10-02T09:00:00Z', additions: 12, deletions: 3, url: 'https://github.com/acme/apollo/commit/aaa', author: { name: 'Lead', email: 'lead@corp.dev', user: { login: 'lead-gh' } } },
                // Mentions another project's key and a task that does not exist: neither may link.
                { oid: 'b'.repeat(40), message: 'Touch OTH-1 and APL-99', committedDate: '2026-10-01T09:00:00Z', additions: 1, deletions: 1, url: 'https://github.com/acme/apollo/commit/bbb', author: { name: 'Lead', email: null, user: null } },
              ],
            },
          },
        },
        pullRequests: {
          nodes: [
            { number: 7, title: 'Login fixes for APL-1', body: 'Closes APL-1', state: prState, mergedAt: prState === 'MERGED' ? '2026-10-03T00:00:00Z' : null, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z', url: 'https://github.com/acme/apollo/pull/7', additions: 40, deletions: 5, changedFiles: 4, headRefName: 'feature/APL-1-login', baseRefName: 'main', reviewDecision: null, author: { login: 'lead-gh', avatarUrl: 'https://avatars.githubusercontent.com/u/1' } },
            { number: 8, title: 'Docs tweak', body: '', state: 'OPEN', mergedAt: null, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T12:00:00Z', url: 'https://github.com/acme/apollo/pull/8', additions: 2, deletions: 0, changedFiles: 1, headRefName: 'docs', baseRefName: 'main', reviewDecision: 'APPROVED', author: { login: 'stranger', avatarUrl: 'https://avatars.githubusercontent.com/u/2' } },
          ],
        },
      },
    },
  };
}

describe('github sync', () => {
  let app: Express;
  let lead: TestUser;
  let outsider: TestUser;
  let projectId: string;
  let taskId: string;
  let repoId: string;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      if (!tokenValid || init.headers.Authorization !== `Bearer ${TOKEN}`) {
        return new Response('{"message":"Bad credentials"}', { status: 401 });
      }
      const { query } = JSON.parse(init.body) as { query: string };
      return new Response(JSON.stringify(githubResponse(query)), { status: 200 });
    }));

    app = await bootTestApp();
    lead = await createUser(app, { email: 'gh-lead@corp.dev', name: 'Lead' });
    await setRole(lead.id, 'ADMIN');
    outsider = await createUser(app, { email: 'gh-outsider@corp.dev', name: 'Outsider' });

    const { db } = await import('../src/db/index.js');
    await db().query(`UPDATE users SET github_handle = 'Lead-GH' WHERE id = $1`, [lead.id]);

    projectId = (await request(app).post('/api/v1/projects').set(auth(lead))
      .send({ name: 'Apollo', key: 'APL', status: 'ACTIVE', color: '#6366f1' }).expect(201)).body.id;
    await request(app).post('/api/v1/projects').set(auth(lead))
      .send({ name: 'Other', key: 'OTH', status: 'ACTIVE', color: '#22c55e' }).expect(201);
    taskId = (await request(app).post('/api/v1/tasks').set(auth(lead))
      .send({ projectId, title: 'Login redirect bug' }).expect(201)).body.id;
  });

  afterEach(() => {
    tokenValid = true;
  });

  afterAll(async () => {
    vi.stubGlobal('fetch', realFetch);
    await shutdownTestApp();
  });

  it('reads task references only in the exact KEY-number form', () => {
    expect(mentionedTaskNumbers('APL', 'Fix APL-1, apl-2 and (APL-30)')).toEqual([1, 2, 30]);
    expect(mentionedTaskNumbers('APL', 'XAPL-1 APL-1a APL-PR4 APL-')).toEqual([]);
  });

  it('refuses a token GitHub rejects, before storing anything', async () => {
    tokenValid = false;
    const res = await request(app).post('/api/v1/repos').set(auth(lead)).send({
      projectId, name: 'apollo', fullName: 'acme/apollo', url: 'https://github.com/acme/apollo', accessToken: TOKEN,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/rejected the access token/);
    const list = await request(app).get('/api/v1/repos').query({ projectId }).set(auth(lead)).expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('connects, syncs branches, commits and pull requests, and never returns the token', async () => {
    const res = await request(app).post('/api/v1/repos').set(auth(lead)).send({
      projectId, name: 'x', fullName: 'acme/apollo', url: 'https://github.com/acme/apollo', accessToken: TOKEN,
    }).expect(201);
    repoId = res.body.id;
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);

    // The first sync runs in the background after connecting.
    let repo = res.body;
    for (let i = 0; i < 50 && !repo.lastSyncedAt; i++) {
      await new Promise((r) => setTimeout(r, 50));
      repo = (await request(app).get(`/api/v1/repos/${repoId}`).set(auth(lead))).body;
    }
    expect(repo.lastSyncedAt).not.toBeNull();
    expect(repo.lastSyncError).toBeNull();
    expect(repo.branches).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'main', isDefault: true, ahead: 0, behind: 0 }),
      expect.objectContaining({ name: 'feature/APL-1-login', ahead: 3, behind: 2 }),
    ]));
    expect(repo.recentCommits).toHaveLength(2);
    expect(repo.recentCommits[0]).toMatchObject({ additions: 12, deletions: 3 });

    const reviews = await request(app).get('/api/v1/reviews').query({ projectId }).set(auth(lead)).expect(200);
    const byNumber = Object.fromEntries(reviews.body.items.map((r: { externalNumber: number }) => [r.externalNumber, r]));
    // Mapped to the member whose GitHub handle matches, case-insensitively.
    expect(byNumber[7]).toMatchObject({ status: 'OPEN', syncedFromGitHub: true, linkedTaskId: taskId, additions: 40 });
    expect(byNumber[7].author.id).toBe(lead.id);
    // No account for this GitHub user: shown by login, decision taken from GitHub.
    expect(byNumber[8]).toMatchObject({ status: 'APPROVED' });
    expect(byNumber[8].author.name).toBe('@stranger');
  });

  it('links the commit, branch and pull request to the task they mention, and nothing else', async () => {
    const links = await request(app).get(`/api/v1/tasks/${taskId}/git`).set(auth(lead)).expect(200);
    const kinds = links.body.map((l: { kind: string }) => l.kind).sort();
    expect(kinds).toEqual(['BRANCH', 'COMMIT', 'PULL_REQUEST']);

    const { db } = await import('../src/db/index.js');
    const { rows } = await db().query<{ n: number }>(`SELECT count(*)::int AS n FROM task_git_links`);
    expect(rows[0]!.n).toBe(3);

    // Someone outside the project cannot read the task's links.
    await request(app).get(`/api/v1/tasks/${taskId}/git`).set(auth(outsider)).expect(404);
  });

  it('updates in place on the next sync and follows a merge', async () => {
    prState = 'MERGED';
    const outcome = await syncRepository(repoId, { force: true });
    expect(outcome.status).toBe('synced');

    const reviews = await request(app).get('/api/v1/reviews').query({ projectId }).set(auth(lead)).expect(200);
    expect(reviews.body.items.filter((r: { externalNumber: number }) => r.externalNumber === 7)).toHaveLength(1);
    const pr7 = reviews.body.items.find((r: { externalNumber: number }) => r.externalNumber === 7);
    expect(pr7.status).toBe('MERGED');

    // Merging or closing a GitHub pull request from XenoSpace would be a lie.
    const pr8 = reviews.body.items.find((r: { externalNumber: number }) => r.externalNumber === 8);
    await request(app).post(`/api/v1/reviews/${pr8.id}/merge`).set(auth(lead)).expect(409);
  });

  it('records why a sync failed, and honours the cooldown', async () => {
    const quick = await request(app).post(`/api/v1/repos/${repoId}/sync`).set(auth(lead)).expect(200);
    expect(quick.body.outcome).toBe('skipped:cooldown');

    tokenValid = false;
    const failed = await syncRepository(repoId, { force: true });
    expect(failed).toMatchObject({ status: 'failed' });
    const repo = await request(app).get(`/api/v1/repos/${repoId}`).set(auth(lead)).expect(200);
    expect(repo.body.lastSyncError).toMatch(/rejected the access token/);
  });
});
