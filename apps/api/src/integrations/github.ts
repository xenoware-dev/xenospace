/**
 * GitHub read client.
 *
 * GraphQL rather than REST: one query returns the repository, the default
 * branch's recent commits with line counts, and recent pull requests with their
 * sizes; a second returns branches with ahead/behind counts. Over REST that is
 * one request per commit, branch and pull request. Read-only by design; the
 * token needs only Metadata, Contents and Pull requests read access.
 */

const ENDPOINT = 'https://api.github.com/graphql';
const TIMEOUT_MS = 20_000;

/** A failure worth showing to whoever connected the repository. */
export class GitHubError extends Error {
  constructor(
    message: string,
    /** True when retrying later may succeed (rate limit, outage, network). */
    readonly transient = false,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface GitHubCommit {
  sha: string;
  message: string;
  committedAt: string;
  additions: number;
  deletions: number;
  url: string;
  authorName: string;
  authorEmail: string | null;
  authorLogin: string | null;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRef: string;
  baseRef: string;
  authorLogin: string | null;
  authorAvatar: string | null;
}

export interface GitHubBranch {
  name: string;
  ahead: number;
  behind: number;
  lastCommitAt: string | null;
  author: string | null;
}

export interface GitHubSnapshot {
  name: string;
  fullName: string;
  url: string;
  isPrivate: boolean;
  defaultBranch: string;
  commits: GitHubCommit[];
  pullRequests: GitHubPullRequest[];
  branches: GitHubBranch[];
}

/** `owner/repo`, the only shape GitHub accepts. */
export function parseFullName(fullName: string): { owner: string; name: string } {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?)\/([A-Za-z0-9._-]{1,100})$/.exec(fullName.trim());
  if (!match) throw new GitHubError('The repository must be written as owner/name, e.g. xenoware/xenospace.');
  return { owner: match[1]!, name: match[2]! };
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'XenoSpace',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GitHubError('Could not reach GitHub. Check the server’s internet connection.', true);
  }

  if (res.status === 401) {
    throw new GitHubError('GitHub rejected the access token. It may be wrong, expired or revoked; add a new one.');
  }
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const when = Number.isFinite(reset) && reset > 0 ? ` after ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC` : ' later';
    throw new GitHubError(`GitHub’s rate limit for this token is used up. Sync will work again${when}.`, true);
  }
  if (res.status >= 500) throw new GitHubError('GitHub is having problems right now. Sync will retry.', true);
  if (!res.ok) throw new GitHubError(`GitHub returned an unexpected error (${res.status}).`);

  const payload = (await res.json()) as { data?: T; errors?: Array<{ type?: string; message?: string }> };
  if (payload.errors?.length) {
    const first = payload.errors[0]!;
    if (first.type === 'NOT_FOUND') {
      throw new GitHubError(
        'GitHub could not find that repository with this token. Check the owner/name, and that the token was given access to this repository.',
      );
    }
    if (first.type === 'FORBIDDEN' || /resource not accessible/i.test(first.message ?? '')) {
      throw new GitHubError(
        'The token cannot read this repository. Give it read access to Contents, Pull requests and Metadata.',
      );
    }
    throw new GitHubError(`GitHub returned an error: ${first.message ?? 'unknown'}.`);
  }
  if (!payload.data) throw new GitHubError('GitHub returned an empty response.', true);
  return payload.data;
}

const REPOSITORY_QUERY = `
query Repository($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name
    nameWithOwner
    url
    isPrivate
    defaultBranchRef {
      name
      target {
        ... on Commit {
          history(first: 50) {
            nodes {
              oid message committedDate additions deletions url
              author { name email user { login } }
            }
          }
        }
      }
    }
    pullRequests(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number title body state mergedAt createdAt updatedAt url
        additions deletions changedFiles headRefName baseRefName reviewDecision
        author { login avatarUrl }
      }
    }
  }
}`;

const BRANCHES_QUERY = `
query Branches($owner: String!, $name: String!, $base: String!) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 50, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
      nodes {
        name
        target { ... on Commit { committedDate author { name user { login } } } }
        compare(headRef: $base) { aheadBy behindBy }
      }
    }
  }
}`;

interface RepositoryData {
  repository: {
    name: string;
    nameWithOwner: string;
    url: string;
    isPrivate: boolean;
    defaultBranchRef: {
      name: string;
      target: {
        history?: {
          nodes: Array<{
            oid: string; message: string; committedDate: string; additions: number; deletions: number; url: string;
            author: { name: string | null; email: string | null; user: { login: string } | null } | null;
          }>;
        };
      };
    } | null;
    pullRequests: {
      nodes: Array<{
        number: number; title: string; body: string; state: 'OPEN' | 'CLOSED' | 'MERGED'; mergedAt: string | null;
        createdAt: string; updatedAt: string; url: string; additions: number; deletions: number; changedFiles: number;
        headRefName: string; baseRefName: string; reviewDecision: GitHubPullRequest['reviewDecision'];
        author: { login: string; avatarUrl: string } | null;
      }>;
    };
  } | null;
}

interface BranchesData {
  repository: {
    refs: {
      nodes: Array<{
        name: string;
        target: { committedDate?: string; author?: { name: string | null; user: { login: string } | null } | null };
        // Compared with the default branch as head: "ahead" there is how far
        // the default branch has moved on, i.e. how far this branch is behind.
        compare: { aheadBy: number; behindBy: number } | null;
      }>;
    };
  } | null;
}

/** Confirms the token can read the repository, returning its metadata. */
export async function verifyAccess(token: string, fullName: string) {
  const snapshot = await fetchSnapshot(token, fullName, { branches: false });
  return { name: snapshot.name, fullName: snapshot.fullName, url: snapshot.url, isPrivate: snapshot.isPrivate, defaultBranch: snapshot.defaultBranch };
}

/** Everything the sync stores, in two requests. */
export async function fetchSnapshot(
  token: string,
  fullName: string,
  opts: { branches?: boolean } = {},
): Promise<GitHubSnapshot> {
  const { owner, name } = parseFullName(fullName);
  const data = await graphql<RepositoryData>(token, REPOSITORY_QUERY, { owner, name });
  const repo = data.repository;
  if (!repo) throw new GitHubError('GitHub could not find that repository with this token.');

  const defaultBranch = repo.defaultBranchRef?.name ?? 'main';
  const commits: GitHubCommit[] = (repo.defaultBranchRef?.target.history?.nodes ?? []).map((c) => ({
    sha: c.oid,
    message: c.message,
    committedAt: c.committedDate,
    additions: c.additions,
    deletions: c.deletions,
    url: c.url,
    authorName: c.author?.name ?? c.author?.user?.login ?? 'Unknown',
    authorEmail: c.author?.email ?? null,
    authorLogin: c.author?.user?.login ?? null,
  }));

  const pullRequests: GitHubPullRequest[] = repo.pullRequests.nodes.map((pr) => ({
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    state: pr.state,
    reviewDecision: pr.reviewDecision ?? null,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    url: pr.url,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    headRef: pr.headRefName,
    baseRef: pr.baseRefName,
    authorLogin: pr.author?.login ?? null,
    authorAvatar: pr.author?.avatarUrl ?? null,
  }));

  let branches: GitHubBranch[] = [];
  if (opts.branches !== false && repo.defaultBranchRef) {
    const refs = await graphql<BranchesData>(token, BRANCHES_QUERY, { owner, name, base: defaultBranch });
    branches = (refs.repository?.refs.nodes ?? []).map((ref) => ({
      name: ref.name,
      ahead: ref.name === defaultBranch ? 0 : ref.compare?.behindBy ?? 0,
      behind: ref.name === defaultBranch ? 0 : ref.compare?.aheadBy ?? 0,
      lastCommitAt: ref.target.committedDate ?? null,
      author: ref.target.author?.user?.login ?? ref.target.author?.name ?? null,
    }));
  }

  return {
    name: repo.name,
    fullName: repo.nameWithOwner,
    url: repo.url,
    isPrivate: repo.isPrivate,
    defaultBranch,
    commits,
    pullRequests,
    branches,
  };
}
