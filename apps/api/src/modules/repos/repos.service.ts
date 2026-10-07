import type { Repository, TaskGitLink } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { GitHubError, verifyAccess } from '../../integrations/github.js';
import { syncRepository } from './repos.sync.js';
import { iso } from '../../lib/serialize.js';
import { encryptField } from '../../auth/crypto.js';
import { recordActivity, writeAudit } from '../../middleware/audit.js';
import type { Principal } from '../../middleware/authenticate.js';
import { applyProjectScope, assertProjectAccess, WhereBuilder } from '../common/access.js';

/**
 * Connected git repositories.
 *
 * `access_token_enc` is never selected by any read path — the SELECT lists
 * columns explicitly and exposes only `hasCredentials`, so a provider token
 * cannot reach a response even by accident.
 */
const REPO_SELECT = `
  SELECT r.id, r.project_id, r.provider, r.name, r.full_name, r.url, r.default_branch,
         r.is_private, r.last_synced_at, r.last_sync_error, r.created_at,
         (r.sync_started_at IS NOT NULL AND r.sync_started_at > now() - interval '5 minutes') AS syncing,
         (r.access_token_enc IS NOT NULL) AS has_credentials,
         (SELECT count(*)::int FROM code_reviews cr
            WHERE cr.repository_id = r.id AND cr.status IN ('OPEN','CHANGES_REQUESTED')) AS open_pull_requests
    FROM repositories r
`;

function mapRepo(row: Record<string, unknown>): Repository {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    provider: row.provider as Repository['provider'],
    name: row.name as string,
    fullName: row.full_name as string,
    url: row.url as string,
    defaultBranch: row.default_branch as string,
    isPrivate: Boolean(row.is_private),
    hasCredentials: Boolean(row.has_credentials),
    openPullRequests: (row.open_pull_requests as number) ?? 0,
    lastSyncedAt: iso(row.last_synced_at as string | null),
    lastSyncError: (row.last_sync_error as string | null) ?? null,
    syncing: Boolean(row.syncing),
    branches: [],
    recentCommits: [],
    createdAt: iso(row.created_at as string)!,
  };
}

export async function listRepos(actor: Principal, projectId?: string): Promise<Repository[]> {
  if (projectId) await assertProjectAccess(actor, projectId);
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'r.project_id');
  where.addIf(projectId, `r.project_id = ?`, projectId);

  const { rows } = await db().query<Record<string, unknown>>(
    `${REPO_SELECT} ${where.sql} ORDER BY r.created_at DESC`,
    where.params,
  );
  const repos = rows.map(mapRepo);
  await attachGitData(repos);
  return repos;
}

/** Loads branches and recent commits for a set of repositories in two queries. */
async function attachGitData(repos: Repository[]): Promise<void> {
  if (repos.length === 0) return;
  const ids = repos.map((r) => r.id);

  const [{ rows: branches }, { rows: commits }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `SELECT repository_id, name, is_default, ahead, behind, last_commit_at, author
         FROM repo_branches WHERE repository_id = ANY($1::uuid[])
         ORDER BY is_default DESC, last_commit_at DESC NULLS LAST`,
      [ids],
    ),
    // A window function keeps this to the newest few per repository rather than
    // every commit ever recorded.
    db().query<Record<string, unknown>>(
      `SELECT * FROM (
         SELECT repository_id, sha, message, author_name, author_email, committed_at,
                additions, deletions, url,
                row_number() OVER (PARTITION BY repository_id ORDER BY committed_at DESC) AS rn
           FROM repo_commits WHERE repository_id = ANY($1::uuid[])
       ) ranked WHERE rn <= 10`,
      [ids],
    ),
  ]);

  const branchesBy = new Map<string, Repository['branches']>();
  for (const b of branches) {
    const list = branchesBy.get(b.repository_id as string) ?? [];
    list.push({
      name: b.name as string,
      isDefault: Boolean(b.is_default),
      ahead: (b.ahead as number) ?? 0,
      behind: (b.behind as number) ?? 0,
      lastCommitAt: iso(b.last_commit_at as string | null),
      author: (b.author as string | null) ?? null,
    });
    branchesBy.set(b.repository_id as string, list);
  }

  const commitsBy = new Map<string, Repository['recentCommits']>();
  for (const c of commits) {
    const list = commitsBy.get(c.repository_id as string) ?? [];
    list.push({
      sha: c.sha as string,
      message: c.message as string,
      authorName: c.author_name as string,
      authorEmail: (c.author_email as string) ?? '',
      committedAt: iso(c.committed_at as string)!,
      additions: (c.additions as number) ?? 0,
      deletions: (c.deletions as number) ?? 0,
      url: (c.url as string | null) ?? null,
    });
    commitsBy.set(c.repository_id as string, list);
  }

  for (const repo of repos) {
    repo.branches = branchesBy.get(repo.id) ?? [];
    repo.recentCommits = commitsBy.get(repo.id) ?? [];
  }
}

export async function getRepo(actor: Principal, id: string): Promise<Repository> {
  const { rows } = await db().query<Record<string, unknown>>(`${REPO_SELECT} WHERE r.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Repository');
  await assertProjectAccess(actor, row.project_id as string);
  const repo = mapRepo(row);
  await attachGitData([repo]);
  return repo;
}

/**
 * Checks a GitHub token against the repository before it is stored, so a typo
 * fails here with a clear reason instead of at the first sync. Returns GitHub's
 * canonical metadata, which replaces whatever was typed.
 */
async function verifyGitHub(token: string, fullName: string) {
  try {
    return await verifyAccess(token, fullName);
  } catch (err) {
    if (err instanceof GitHubError) throw badRequest(err.message);
    throw err;
  }
}

/** Sync in the background; the client hears `repo:synced` when it lands. */
function syncSoon(repositoryId: string): void {
  void syncRepository(repositoryId, { force: true }).catch((err: unknown) =>
    logger.warn({ err, repositoryId }, 'initial repository sync failed'),
  );
}

export async function connectRepo(actor: Principal, input: Record<string, unknown>): Promise<Repository> {
  const projectId = input.projectId as string;
  await assertProjectAccess(actor, projectId);

  if ((input.provider ?? 'GITHUB') === 'GITHUB' && input.accessToken) {
    const meta = await verifyGitHub(input.accessToken as string, input.fullName as string);
    input = { ...input, name: meta.name, fullName: meta.fullName, url: meta.url, isPrivate: meta.isPrivate, defaultBranch: meta.defaultBranch };
  }

  const id = await db().transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO repositories (project_id, provider, name, full_name, url, default_branch,
                                 is_private, access_token_enc, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (project_id, full_name) DO UPDATE
         SET url = EXCLUDED.url, default_branch = EXCLUDED.default_branch,
             is_private = EXCLUDED.is_private,
             access_token_enc = COALESCE(EXCLUDED.access_token_enc, repositories.access_token_enc)
       RETURNING id`,
      [
        projectId, input.provider ?? 'GITHUB', input.name, input.fullName, input.url,
        input.defaultBranch ?? 'main', input.isPrivate ?? true,
        // Encrypted at rest with AES-256-GCM; the plaintext never touches a column.
        input.accessToken ? encryptField(input.accessToken as string) : null,
        actor.id,
      ],
    );
    const repoId = rows[0]!.id;
    await recordActivity(
      { actorId: actor.id, action: 'repo.connected', entityType: 'repository', entityId: repoId, entityLabel: input.fullName as string, projectId },
      tx,
    );
    // Recorded without the token, so the audit trail never carries a secret.
    await writeAudit(
      { actorId: actor.id, action: 'repo.connect', resource: 'repository', resourceId: repoId, metadata: { fullName: input.fullName, hasToken: Boolean(input.accessToken) } },
      tx,
    );
    return repoId;
  });

  if (input.accessToken) syncSoon(id);
  return getRepo(actor, id);
}

export async function updateRepo(actor: Principal, id: string, input: Record<string, unknown>): Promise<Repository> {
  const repo = await getRepo(actor, id);
  const columns: Record<string, string> = {
    name: 'name', fullName: 'full_name', url: 'url', defaultBranch: 'default_branch', isPrivate: 'is_private',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (input.accessToken) {
    if (repo.provider === 'GITHUB') {
      await verifyGitHub(input.accessToken as string, (input.fullName as string | undefined) ?? repo.fullName);
    }
    params.push(encryptField(input.accessToken as string));
    sets.push(`access_token_enc = $${params.length}`);
    // A new token clears the old failure; the sync below re-checks everything.
    sets.push(`last_sync_error = NULL`);
  }
  if (sets.length === 0) return repo;

  await db().query(`UPDATE repositories SET ${sets.join(', ')} WHERE id = $1`, params);
  await writeAudit({
    actorId: actor.id, action: 'repo.update', resource: 'repository', resourceId: id,
    metadata: { fields: Object.keys(input).filter((k) => k !== 'accessToken') },
  });
  if (input.accessToken) syncSoon(id);
  return getRepo(actor, id);
}

/** "Sync now". Any member who can see the repository may ask; the cooldown bounds it. */
export async function requestSync(actor: Principal, id: string): Promise<{ outcome: string; repository: Repository }> {
  const repo = await getRepo(actor, id);
  if (repo.provider !== 'GITHUB') throw badRequest('Only GitHub repositories can be synced.');
  if (!repo.hasCredentials) throw badRequest('Add a GitHub access token to this repository first.');
  const outcome = await syncRepository(id);
  return { outcome: outcome.status === 'skipped' ? `skipped:${outcome.reason}` : outcome.status, repository: await getRepo(actor, id) };
}

/** GitHub activity that mentions a task. The caller has already checked access to the task. */
export async function listTaskGitLinks(taskId: string): Promise<TaskGitLink[]> {
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT l.id, l.kind, l.ref, l.title, l.url, l.state, l.author, l.occurred_at, r.id AS repo_id, r.full_name
       FROM task_git_links l JOIN repositories r ON r.id = l.repository_id
      WHERE l.task_id = $1
      ORDER BY l.occurred_at DESC NULLS LAST
      LIMIT 100`,
    [taskId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    kind: row.kind as TaskGitLink['kind'],
    ref: row.ref as string,
    title: row.title as string,
    url: (row.url as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    occurredAt: iso(row.occurred_at as string | null),
    repository: { id: row.repo_id as string, fullName: row.full_name as string },
  }));
}

export async function disconnectRepo(actor: Principal, id: string): Promise<void> {
  const repo = await getRepo(actor, id);
  await db().transaction(async (tx) => {
    await tx.query(`DELETE FROM repositories WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'repo.disconnected', entityType: 'repository', entityId: id, entityLabel: repo.fullName, projectId: repo.projectId },
      tx,
    );
    await writeAudit(
      { actorId: actor.id, action: 'repo.disconnect', resource: 'repository', resourceId: id },
      tx,
    );
  });
}

/** Aggregate commit activity across the repositories the actor can see. */
export async function commitActivity(
  actor: Principal,
  opts: { projectId?: string; days: number },
): Promise<Array<{ date: string; commits: number; additions: number; deletions: number }>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'r.project_id');
  where.addIf(opts.projectId, `r.project_id = ?`, opts.projectId);
  where.add(`c.committed_at >= now() - (? || ' days')::interval`, String(opts.days));

  const { rows } = await db().query<{ date: string; commits: number; additions: number; deletions: number }>(
    `SELECT to_char(date_trunc('day', c.committed_at), 'YYYY-MM-DD') AS date,
            count(*)::int AS commits,
            coalesce(sum(c.additions), 0)::int AS additions,
            coalesce(sum(c.deletions), 0)::int AS deletions
       FROM repo_commits c
       JOIN repositories r ON r.id = c.repository_id
       ${where.sql}
      GROUP BY 1 ORDER BY 1`,
    where.params,
  );
  return rows;
}
