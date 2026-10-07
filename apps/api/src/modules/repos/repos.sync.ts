import { env, isTest } from '../../config/env.js';
import { db, type Queryable } from '../../db/index.js';
import { decryptField } from '../../auth/crypto.js';
import { logger } from '../../lib/logger.js';
import { realtime } from '../../realtime/socket.js';
import {
  fetchSnapshot, GitHubError, type GitHubBranch, type GitHubCommit, type GitHubPullRequest, type GitHubSnapshot,
} from '../../integrations/github.js';

/**
 * GitHub → XenoSpace sync for one repository.
 *
 * Fetches outside any transaction (GitHub can take seconds), then writes the
 * whole snapshot in one transaction with one statement per table — every
 * database round trip is costly against a remote Postgres, and per-row writes
 * would turn a sync into tens of seconds.
 */

/** How long a sync may hold its lease before another may take over. */
const LEASE_MINUTES = 5;
/** Minimum gap between syncs of one repository, so clicks cannot drain the token's rate limit. */
const COOLDOWN_SECONDS = 30;

export type SyncOutcome =
  | { status: 'synced'; commits: number; branches: number; pullRequests: number; links: number }
  | { status: 'skipped'; reason: 'busy' | 'cooldown' }
  | { status: 'failed'; error: string };

interface Claimed {
  project_id: string;
  provider: string;
  full_name: string;
  url: string;
  access_token_enc: string | null;
  project_key: string;
}

export async function syncRepository(repositoryId: string, opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  // The lease: a single UPDATE, so two instances (or a click and the timer)
  // cannot both win. A crashed sync's lease expires after LEASE_MINUTES.
  const { rows } = await db().query<Claimed>(
    `UPDATE repositories r SET sync_started_at = now()
       FROM projects p
      WHERE r.id = $1 AND p.id = r.project_id
        AND (r.sync_started_at IS NULL OR r.sync_started_at < now() - ($2 || ' minutes')::interval)
        AND ($3::boolean OR r.last_synced_at IS NULL OR r.last_synced_at < now() - ($4 || ' seconds')::interval)
      RETURNING r.project_id, r.provider, r.full_name, r.url, r.access_token_enc, p.key AS project_key`,
    [repositoryId, String(LEASE_MINUTES), Boolean(opts.force), String(COOLDOWN_SECONDS)],
  );
  const repo = rows[0];
  if (!repo) {
    const { rows: state } = await db().query<{ busy: boolean }>(
      `SELECT (sync_started_at IS NOT NULL AND sync_started_at > now() - ($2 || ' minutes')::interval) AS busy
         FROM repositories WHERE id = $1`,
      [repositoryId, String(LEASE_MINUTES)],
    );
    return { status: 'skipped', reason: state[0]?.busy ? 'busy' : 'cooldown' };
  }

  try {
    if (repo.provider !== 'GITHUB') throw new GitHubError('Only GitHub repositories can be synced.');
    if (!repo.access_token_enc) throw new GitHubError('Add a GitHub access token to sync this repository.');
    const token = decryptField(repo.access_token_enc);
    if (!token) {
      throw new GitHubError('The stored token can no longer be read (the server’s encryption key changed). Add the token again.');
    }

    const snapshot = await fetchSnapshot(token, repo.full_name);
    const counts = await db().transaction((tx) => writeSnapshot(tx, repositoryId, repo, snapshot));
    realtime.toProject(repo.project_id, 'repo:synced', { repositoryId, projectId: repo.project_id });
    return { status: 'synced', ...counts };
  } catch (err) {
    const message = err instanceof GitHubError ? err.message : 'Sync failed unexpectedly. The error has been logged.';
    if (!(err instanceof GitHubError)) logger.error({ err, repositoryId }, 'repository sync failed');
    await db().query(
      `UPDATE repositories SET sync_started_at = NULL, last_sync_error = $2 WHERE id = $1`,
      [repositoryId, message],
    );
    realtime.toProject(repo.project_id, 'repo:synced', { repositoryId, projectId: repo.project_id });
    return { status: 'failed', error: message };
  }
}

async function writeSnapshot(
  tx: Queryable,
  repositoryId: string,
  repo: Claimed,
  s: GitHubSnapshot,
): Promise<{ commits: number; branches: number; pullRequests: number; links: number }> {
  await tx.query(
    `UPDATE repositories
        SET name = $2, full_name = $3, url = $4, is_private = $5, default_branch = $6,
            last_synced_at = now(), last_sync_error = NULL, sync_started_at = NULL
      WHERE id = $1`,
    [repositoryId, s.name, s.fullName, s.url, s.isPrivate, s.defaultBranch],
  );

  await writeBranches(tx, repositoryId, s.defaultBranch, s.branches);
  await writeCommits(tx, repositoryId, s.commits);
  await writePullRequests(tx, repositoryId, repo.project_id, s.pullRequests);
  const links = await writeTaskLinks(tx, repositoryId, repo.project_id, repo.project_key, s);

  return { commits: s.commits.length, branches: s.branches.length, pullRequests: s.pullRequests.length, links };
}

async function writeBranches(tx: Queryable, repositoryId: string, defaultBranch: string, branches: GitHubBranch[]) {
  // Branches deleted on GitHub go here too; only the 50 most recent are fetched,
  // so an old untouched branch dropping off the list also disappears.
  await tx.query(
    `DELETE FROM repo_branches WHERE repository_id = $1 AND NOT (name = ANY($2::text[]))`,
    [repositoryId, branches.map((b) => b.name)],
  );
  if (branches.length === 0) return;
  await tx.query(
    `INSERT INTO repo_branches (repository_id, name, is_default, ahead, behind, last_commit_at, author)
     SELECT $1, b.name, b.name = $2, b.ahead, b.behind, b.last_commit_at, b.author
       FROM unnest($3::text[], $4::int[], $5::int[], $6::timestamptz[], $7::text[])
            AS b(name, ahead, behind, last_commit_at, author)
     ON CONFLICT (repository_id, name) DO UPDATE
        SET is_default = EXCLUDED.is_default, ahead = EXCLUDED.ahead, behind = EXCLUDED.behind,
            last_commit_at = EXCLUDED.last_commit_at, author = EXCLUDED.author`,
    [
      repositoryId, defaultBranch,
      branches.map((b) => b.name), branches.map((b) => b.ahead), branches.map((b) => b.behind),
      branches.map((b) => b.lastCommitAt), branches.map((b) => b.author),
    ],
  );
}

async function writeCommits(tx: Queryable, repositoryId: string, commits: GitHubCommit[]) {
  if (commits.length === 0) return;
  await tx.query(
    `INSERT INTO repo_commits (repository_id, sha, message, author_name, author_email, committed_at, additions, deletions, url)
     SELECT $1, c.sha, c.message, c.author_name, c.author_email, c.committed_at, c.additions, c.deletions, c.url
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::int[], $8::int[], $9::text[])
            AS c(sha, message, author_name, author_email, committed_at, additions, deletions, url)
     ON CONFLICT (repository_id, sha) DO UPDATE
        SET message = EXCLUDED.message, additions = EXCLUDED.additions, deletions = EXCLUDED.deletions, url = EXCLUDED.url`,
    [
      repositoryId,
      commits.map((c) => c.sha), commits.map((c) => c.message.slice(0, 10_000)), commits.map((c) => c.authorName),
      commits.map((c) => c.authorEmail), commits.map((c) => c.committedAt), commits.map((c) => c.additions),
      commits.map((c) => c.deletions), commits.map((c) => c.url),
    ],
  );
}

/**
 * GitHub state wins for merged and closed pull requests and for a decision
 * made on GitHub. Without a GitHub decision, a verdict given in XenoSpace is
 * kept rather than reset to OPEN on every sync.
 */
function githubStatus(pr: GitHubPullRequest): string {
  if (pr.state === 'MERGED') return 'MERGED';
  if (pr.state === 'CLOSED') return 'CLOSED';
  if (pr.reviewDecision === 'APPROVED') return 'APPROVED';
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED';
  return 'OPEN';
}

async function writePullRequests(tx: Queryable, repositoryId: string, projectId: string, prs: GitHubPullRequest[]) {
  if (prs.length === 0) return;

  const { rows: existing } = await tx.query<{ external_number: number }>(
    `SELECT external_number FROM code_reviews WHERE repository_id = $1 AND external_number = ANY($2::int[])`,
    [repositoryId, prs.map((p) => p.number)],
  );
  const known = new Set(existing.map((r) => Number(r.external_number)));
  const fresh = prs.filter((p) => !known.has(p.number));
  const seen = prs.filter((p) => known.has(p.number));

  const columns = (list: GitHubPullRequest[]) => [
    list.map((p) => p.number), list.map((p) => p.title.slice(0, 300)), list.map((p) => p.body.slice(0, 20_000)),
    list.map(githubStatus), list.map((p) => p.reviewDecision === 'APPROVED' || p.reviewDecision === 'CHANGES_REQUESTED'),
    list.map((p) => p.authorLogin), list.map((p) => p.authorAvatar), list.map((p) => p.url),
    list.map((p) => p.additions), list.map((p) => p.deletions), list.map((p) => p.changedFiles),
    list.map((p) => p.headRef), list.map((p) => p.baseRef),
    list.map((p) => p.createdAt), list.map((p) => p.updatedAt), list.map((p) => p.mergedAt),
  ];
  const UNNEST = `unnest($2::int[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::text[], $9::text[],
                        $10::int[], $11::int[], $12::int[], $13::text[], $14::text[],
                        $15::timestamptz[], $16::timestamptz[], $17::timestamptz[])
                  AS u(num, title, body, status, decided, login, avatar, url, additions, deletions, changed,
                       head, base, created_at, updated_at, merged_at)`;
  // A GitHub login maps to a member through their profile's GitHub handle.
  const AUTHOR = `(SELECT id FROM users WHERE lower(github_handle) = lower(u.login) LIMIT 1)`;

  if (seen.length > 0) {
    await tx.query(
      `UPDATE code_reviews cr
          SET title = u.title, description = NULLIF(u.body, ''),
              status = CASE
                WHEN u.status IN ('MERGED', 'CLOSED') OR u.decided THEN u.status
                WHEN cr.status IN ('APPROVED', 'CHANGES_REQUESTED') THEN cr.status
                ELSE 'OPEN' END,
              external_url = u.url, additions = u.additions, deletions = u.deletions, changed_files = u.changed,
              source_branch = u.head, target_branch = u.base, updated_at = u.updated_at, merged_at = u.merged_at,
              external_author = u.login, external_author_avatar = u.avatar,
              author_id = COALESCE(${AUTHOR}, cr.author_id)
         FROM ${UNNEST}
        WHERE cr.repository_id = $1 AND cr.external_number = u.num`,
      [repositoryId, ...columns(seen)],
    );
  }

  if (fresh.length > 0) {
    // Review references share the project's counter with tasks, as manual
    // reviews do; one UPDATE reserves a block for every new pull request.
    const { rows: counter } = await tx.query<{ task_counter: number }>(
      `UPDATE projects SET task_counter = task_counter + $2 WHERE id = $1 RETURNING task_counter`,
      [projectId, fresh.length],
    );
    const last = Number(counter[0]!.task_counter);
    // Oldest pull request gets the lowest number, so references read in order.
    const ordered = [...fresh].sort((a, b) => a.number - b.number);
    const numbers = ordered.map((_, i) => last - ordered.length + 1 + i);
    await tx.query(
      `INSERT INTO code_reviews (project_id, repository_id, number, title, description, status, author_id,
                                 source_branch, target_branch, external_number, external_url,
                                 additions, deletions, changed_files, created_at, updated_at, merged_at,
                                 external_author, external_author_avatar)
       SELECT $18, $1, n.number, u.title, NULLIF(u.body, ''), u.status, ${AUTHOR},
              u.head, u.base, u.num, u.url, u.additions, u.deletions, u.changed,
              u.created_at, u.updated_at, u.merged_at, u.login, u.avatar
         FROM ${UNNEST}
         JOIN unnest($19::int[], $20::int[]) AS n(num, number) ON n.num = u.num`,
      [repositoryId, ...columns(ordered), projectId, ordered.map((p) => p.number), numbers],
    );
  }
}

interface LinkRow {
  taskNumber: number;
  kind: 'COMMIT' | 'PULL_REQUEST' | 'BRANCH';
  ref: string;
  title: string;
  url: string | null;
  state: string | null;
  author: string | null;
  occurredAt: string | null;
}

/** Task numbers mentioned as `KEY-123` in any of the given text. */
export function mentionedTaskNumbers(projectKey: string, ...texts: Array<string | null | undefined>): number[] {
  const key = projectKey.replace(/[^A-Za-z0-9]/g, '');
  if (!key) return [];
  // Not preceded by a letter or digit, so "FOOXSP-1" does not count; the
  // number must end the token, so "XSP-12a" does not either.
  const pattern = new RegExp(`(?<![A-Za-z0-9])${key}-(\\d{1,7})(?![A-Za-z0-9])`, 'gi');
  const found = new Set<number>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(pattern)) found.add(Number(m[1]));
  }
  return [...found];
}

/**
 * Links commits, branches and pull requests to the tasks they mention. Only
 * tasks in the repository's own project: anyone who can see the task can see
 * the link, so a cross-project link would leak another project's activity.
 */
async function writeTaskLinks(
  tx: Queryable,
  repositoryId: string,
  projectId: string,
  projectKey: string,
  s: GitHubSnapshot,
): Promise<number> {
  const rows: LinkRow[] = [];
  for (const c of s.commits) {
    for (const n of mentionedTaskNumbers(projectKey, c.message)) {
      rows.push({
        taskNumber: n, kind: 'COMMIT', ref: c.sha, title: c.message.split('\n')[0]!.slice(0, 300),
        url: c.url, state: null, author: c.authorLogin ?? c.authorName, occurredAt: c.committedAt,
      });
    }
  }
  for (const p of s.pullRequests) {
    for (const n of mentionedTaskNumbers(projectKey, p.title, p.body, p.headRef)) {
      rows.push({
        taskNumber: n, kind: 'PULL_REQUEST', ref: String(p.number), title: p.title.slice(0, 300),
        url: p.url, state: p.state, author: p.authorLogin, occurredAt: p.updatedAt,
      });
    }
  }
  for (const b of s.branches) {
    for (const n of mentionedTaskNumbers(projectKey, b.name)) {
      rows.push({
        taskNumber: n, kind: 'BRANCH', ref: b.name, title: b.name,
        url: `${s.url}/tree/${encodeURIComponent(b.name)}`, state: null, author: b.author, occurredAt: b.lastCommitAt,
      });
    }
  }

  // A deleted branch should not keep showing on its task.
  await tx.query(
    `DELETE FROM task_git_links WHERE repository_id = $1 AND kind = 'BRANCH' AND NOT (ref = ANY($2::text[]))`,
    [repositoryId, s.branches.map((b) => b.name)],
  );
  if (rows.length === 0) return 0;

  const { rowCount } = await tx.query(
    `INSERT INTO task_git_links (task_id, repository_id, kind, ref, title, url, state, author, occurred_at)
     SELECT t.id, $1, l.kind, l.ref, l.title, l.url, l.state, l.author, l.occurred_at
       FROM unnest($3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::timestamptz[])
            AS l(task_number, kind, ref, title, url, state, author, occurred_at)
       JOIN tasks t ON t.project_id = $2 AND t.number = l.task_number
     ON CONFLICT (task_id, repository_id, kind, ref) DO UPDATE
        SET title = EXCLUDED.title, url = EXCLUDED.url, state = EXCLUDED.state,
            author = EXCLUDED.author, occurred_at = EXCLUDED.occurred_at`,
    [
      repositoryId, projectId,
      rows.map((r) => r.taskNumber), rows.map((r) => r.kind), rows.map((r) => r.ref), rows.map((r) => r.title),
      rows.map((r) => r.url), rows.map((r) => r.state), rows.map((r) => r.author), rows.map((r) => r.occurredAt),
    ],
  );

  // A pull request's code review points at the first task it mentions, unless
  // someone already linked one by hand.
  await tx.query(
    `UPDATE code_reviews cr SET linked_task_id = l.task_id
       FROM (SELECT DISTINCT ON (ref) ref, task_id FROM task_git_links
              WHERE repository_id = $1 AND kind = 'PULL_REQUEST' ORDER BY ref, created_at) l
      WHERE cr.repository_id = $1 AND cr.external_number = l.ref::int AND cr.linked_task_id IS NULL`,
    [repositoryId],
  );

  return rowCount ?? 0;
}

/* -------------------------------------------------------------- scheduler */

let timer: NodeJS.Timeout | null = null;

/** Syncs every GitHub repository with a token on an interval. */
export function startGitHubSync(): void {
  const minutes = env.GITHUB_SYNC_INTERVAL_MINUTES;
  if (isTest || minutes <= 0 || timer) return;

  const run = async () => {
    try {
      const { rows } = await db().query<{ id: string }>(
        `SELECT id FROM repositories WHERE provider = 'GITHUB' AND access_token_enc IS NOT NULL
          ORDER BY last_synced_at NULLS FIRST`,
      );
      // One at a time: the work is network-bound and the token rate limit is
      // shared by every repository using it.
      for (const { id } of rows) await syncRepository(id);
    } catch (err) {
      logger.warn({ err }, 'scheduled github sync failed');
    }
  };

  timer = setInterval(() => void run(), minutes * 60_000);
  timer.unref();
  // First pass shortly after boot, not immediately, so startup stays quick.
  setTimeout(() => void run(), 15_000).unref();
  logger.info({ everyMinutes: minutes }, 'github sync scheduled');
}

export function stopGitHubSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
