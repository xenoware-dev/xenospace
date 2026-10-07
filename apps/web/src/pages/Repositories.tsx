import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { connectRepoSchema, type Repository } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { number, relativeTime, shortSha, titleCase } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select, TextInput } from '@/components/ui/Field.jsx';
import { FilterSelect } from '@/components/ui/Toolbar.jsx';
import { ThroughputChart } from '@/components/charts/index.jsx';
import { useToast } from '@/components/ui/Toast.jsx';
import { Branch, Commit, Edit, External, Git, Plus, Refresh, Shield, Trash, Warning } from '@/components/icons.jsx';

/**
 * Connected repositories.
 *
 * Shows branches and recent commits per repository. Access tokens are
 * write-only — the API never returns one, so this page can only ever report
 * whether credentials exist, never reveal them.
 */
export function RepositoriesPage() {
  const { allows } = useAuth();
  const { data: projects } = useProjectOptions();
  const [connectOpen, setConnectOpen] = useQueryFlag('new');
  const [disconnecting, setDisconnecting] = useState<Repository | null>(null);
  const [editingToken, setEditingToken] = useState<Repository | null>(null);

  const { filters, setFilter } = useFilters({ projectId: '' });

  const { data: repos, isLoading, error, refetch } = useQuery({
    queryKey: keys.repos(filters.projectId || undefined),
    queryFn: () => api.get<Repository[]>('/repos', { projectId: filters.projectId || undefined }),
    // While a sync is running (including the first one after connecting),
    // check back every few seconds so the result appears without a reload.
    refetchInterval: (query) => ((query.state.data ?? []).some(isSyncPending) ? 3000 : false),
  });

  const { data: activity } = useQuery({
    queryKey: keys.repoActivity({ projectId: filters.projectId, days: 30 }),
    queryFn: () =>
      api.get<Array<{ date: string; commits: number; additions: number; deletions: number }>>('/repos/activity', {
        projectId: filters.projectId || undefined,
        days: '30',
      }),
  });

  const disconnect = useMutate((id: string) => api.delete(`/repos/${id}`), {
    invalidates: [['repos']],
    successMessage: 'Repository disconnected',
    onSuccess: () => setDisconnecting(null),
  });

  return (
    <Page
      title="Git Repositories"
      description="Connected repositories, their branches and recent commit activity."
      actions={
        allows('repo:connect') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setConnectOpen(true)}>
            Connect a repository
          </Button>
        )
      }
      toolbar={
        <FilterSelect
          label="Project"
          value={filters.projectId}
          onChange={(value) => setFilter('projectId', value)}
          options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
        />
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message="Repositories could not be loaded." onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          {activity && activity.some((day) => day.commits > 0) && (
            <Card>
              {/* Reuses the throughput chart shape: commits read the same way
                  as task throughput, so the page stays visually consistent. */}
              <ThroughputChart
                title="Commit activity"
                subtitle="Commits and lines changed over the last 30 days"
                data={activity.map((day) => ({
                  date: day.date,
                  completed: day.commits,
                  created: Math.round((day.additions + day.deletions) / 50),
                }))}
                height={180}
              />
              <p className="mt-2 text-2xs text-[var(--ink-faint)]">
                The second series is lines changed, scaled down by 50 so both fit one axis.
              </p>
            </Card>
          )}

          {!repos || repos.length === 0 ? (
            <EmptyState
              icon={<Git size={20} />}
              title="No repositories connected"
              message={
                allows('repo:connect')
                  ? 'Connect a repository to track branches, commits and pull requests alongside your tasks.'
                  : 'Your team lead has not connected a repository to these projects yet.'
              }
              action={
                allows('repo:connect') ? (
                  <Button variant="primary" icon={<Plus size={14} />} onClick={() => setConnectOpen(true)}>
                    Connect a repository
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="flex flex-col gap-4">
              {repos.map((repo) => (
                <RepoCard
                  key={repo.id}
                  repo={repo}
                  canDisconnect={allows('repo:disconnect')}
                  canUpdate={allows('repo:update')}
                  onDisconnect={() => setDisconnecting(repo)}
                  onEditToken={() => setEditingToken(repo)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <ConnectRepoModal open={connectOpen} onClose={() => setConnectOpen(false)} />
      {editingToken && <TokenModal repo={editingToken} onClose={() => setEditingToken(null)} />}

      <ConfirmDialog
        open={disconnecting !== null}
        onClose={() => setDisconnecting(null)}
        onConfirm={() => disconnecting && disconnect.mutate(disconnecting.id)}
        title={`Disconnect ${disconnecting?.fullName ?? ''}?`}
        message="Branch and commit history recorded here is removed. The repository itself is untouched."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
      />
    </Page>
  );
}

/** The first sync after connecting has not reported yet, or one is running. */
function isSyncPending(repo: Repository): boolean {
  return repo.syncing || (repo.provider === 'GITHUB' && repo.hasCredentials && !repo.lastSyncedAt && !repo.lastSyncError);
}

function RepoCard({
  repo, canDisconnect, canUpdate, onDisconnect, onEditToken,
}: {
  repo: Repository;
  canDisconnect: boolean;
  canUpdate: boolean;
  onDisconnect: () => void;
  onEditToken: () => void;
}) {
  const toast = useToast();
  const pending = isSyncPending(repo);
  const canSync = repo.provider === 'GITHUB' && repo.hasCredentials;

  const sync = useMutate(
    () => api.post<{ outcome: string; repository: Repository }>(`/repos/${repo.id}/sync`),
    {
      invalidates: [['repos'], ['reviews'], ['tasks']],
      onSuccess: ({ outcome, repository }) => {
        if (outcome === 'synced') toast.success('Synced with GitHub', repository.fullName);
        else if (outcome === 'failed') toast.error('Sync failed', repository.lastSyncError ?? undefined);
        else if (outcome === 'skipped:busy') toast.info('Already syncing', 'The result will appear here shortly.');
        else toast.info('Synced moments ago', 'Wait half a minute before syncing again.');
      },
      errorMessage: 'Could not sync',
    },
  );

  return (
    <Card as="li">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Git size={15} className="shrink-0 text-[var(--ink-muted)]" />
            <span className="truncate-line font-mono text-sm">{repo.fullName}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" size="sm">{titleCase(repo.provider)}</Badge>
            {repo.isPrivate && <Badge tone="neutral" size="sm">Private</Badge>}
            {repo.hasCredentials ? (
              <Badge tone="good" size="sm" icon={<Shield size={9} />}>Token stored</Badge>
            ) : (
              <Badge tone="warning" size="sm">No token</Badge>
            )}
            {repo.openPullRequests > 0 && (
              <Badge tone="info" size="sm">{repo.openPullRequests} open PRs</Badge>
            )}
            {pending ? (
              <span className="flex items-center gap-1 text-2xs text-[var(--ink-secondary)]">
                <Refresh size={10} className="animate-spin" /> Syncing with GitHub…
              </span>
            ) : (
              repo.lastSyncedAt && <span className="text-2xs">· synced {relativeTime(repo.lastSyncedAt)}</span>
            )}
          </span>
        }
        action={
          <span className="flex items-center gap-1">
            {canSync && (
              <Button
                size="sm"
                variant="secondary"
                icon={<Refresh size={13} className={cn((pending || sync.isPending) && 'animate-spin')} />}
                disabled={pending || sync.isPending}
                onClick={() => sync.mutate(undefined as never)}
              >
                Sync now
              </Button>
            )}
            {canUpdate && repo.provider === 'GITHUB' && (
              <IconButton label={repo.hasCredentials ? 'Replace access token' : 'Add access token'} size="sm" onClick={onEditToken}>
                <Edit size={14} />
              </IconButton>
            )}
            <IconButton
              label="Open repository"
              size="sm"
              onClick={() => window.open(repo.url, '_blank', 'noopener,noreferrer')}
            >
              <External size={14} />
            </IconButton>
            {canDisconnect && (
              <IconButton label="Disconnect repository" size="sm" onClick={onDisconnect}>
                <Trash size={14} />
              </IconButton>
            )}
          </span>
        }
      />

      {repo.lastSyncError && !pending && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--status-critical-wash)] px-3.5 py-3 text-xs text-[var(--status-critical-ink)]">
          <Warning size={14} className="mt-px shrink-0" />
          <span className="min-w-0 flex-1 leading-relaxed">
            <span className="font-medium">Last sync failed.</span> {repo.lastSyncError}
          </span>
          {canUpdate && (
            <button type="button" onClick={onEditToken} className="shrink-0 font-medium underline underline-offset-2">
              Update token
            </button>
          )}
        </div>
      )}
      {repo.provider === 'GITHUB' && !repo.hasCredentials && (
        <p className="mt-4 rounded-[var(--radius-lg)] bg-[var(--glass-control)] px-3.5 py-3 text-xs leading-relaxed text-[var(--ink-secondary)]">
          No access token, so nothing syncs from GitHub.{' '}
          {canUpdate ? (
            <button type="button" onClick={onEditToken} className="font-medium text-[var(--ink-primary)] underline underline-offset-2">
              Add a token
            </button>
          ) : (
            'Ask your team lead to add one.'
          )}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* ------------------------------------------------------- branches */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
            <Branch size={11} />
            Branches ({repo.branches.length})
          </h4>
          {repo.branches.length === 0 ? (
            <p className="text-2xs text-[var(--ink-faint)] italic">No branch data recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {repo.branches.map((branch) => (
                <li
                  key={branch.name}
                  className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate-line font-mono text-2xs">{branch.name}</span>
                  {branch.isDefault && <Badge tone="accent" size="sm">default</Badge>}
                  {/* Ahead/behind as a pair, which is how git reports divergence. */}
                  {(branch.ahead > 0 || branch.behind > 0) && (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">
                      {branch.ahead > 0 && <span className="text-[var(--status-good-ink)]">↑{branch.ahead}</span>}
                      {branch.behind > 0 && <span className="ml-1 text-[var(--status-serious-ink)]">↓{branch.behind}</span>}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* -------------------------------------------------------- commits */}
        <div className="min-w-0">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
            <Commit size={11} />
            Recent commits
          </h4>
          {repo.recentCommits.length === 0 ? (
            <p className="text-2xs text-[var(--ink-faint)] italic">No commits recorded.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {repo.recentCommits.map((commit) => (
                <li key={commit.sha}>
                  <div className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-[var(--wash-hover)]">
                    <code className="shrink-0 rounded-[var(--radius-xs)] bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-muted)]">
                      {shortSha(commit.sha)}
                    </code>
                    <span className="min-w-0 flex-1 truncate-line text-xs">{commit.message}</span>
                    <span className="hidden shrink-0 font-mono text-[10px] tabular-nums sm:block">
                      <span className="text-[var(--status-good-ink)]">+{number(commit.additions)}</span>{' '}
                      <span className="text-[var(--status-critical-ink)]">−{number(commit.deletions)}</span>
                    </span>
                    <span className="hidden w-24 shrink-0 truncate-line text-right text-2xs text-[var(--ink-faint)] md:block">
                      {commit.authorName}
                    </span>
                    <span className="shrink-0 text-2xs text-[var(--ink-faint)]">
                      {relativeTime(commit.committedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Accepts `owner/repo` or a pasted GitHub URL, which is what people copy. */
function parseGitHubRepo(input: string): string | null {
  const value = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const fromUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)/i.exec(value);
  if (fromUrl) return fromUrl[1]!;
  return /^[\w.-]+\/[\w.-]+$/.test(value) ? value : null;
}

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

/** The steps for a read-only, single-repository token, so nobody over-grants. */
function TokenHelp() {
  return (
    <details className="group rounded-[var(--radius-lg)] bg-[var(--glass-control)] px-3.5 py-3 text-xs leading-relaxed text-[var(--ink-secondary)]">
      <summary className="cursor-pointer list-none font-medium text-[var(--ink-primary)] select-none">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        How to create the token (2 minutes)
      </summary>
      <ol className="mt-2.5 ml-4 flex list-decimal flex-col gap-1.5">
        <li>
          Open{' '}
          <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--ink-primary)] underline underline-offset-2">
            GitHub → Fine-grained token
          </a>
          , signed in as an account that can see the repository.
        </li>
        <li>Name it “XenoSpace”, pick an expiry, and set <b>Resource owner</b> to the repository’s owner.</li>
        <li><b>Repository access</b> → <i>Only select repositories</i> → choose this repository.</li>
        <li>
          <b>Permissions</b> → Repository: <b>Contents</b>, <b>Pull requests</b> and <b>Metadata</b>, all <i>Read-only</i>.
          Nothing else.
        </li>
        <li>Generate, copy the token (starts with <code className="font-mono">github_pat_</code>) and paste it below.</li>
      </ol>
    </details>
  );
}

function ConnectRepoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: projects } = useProjectOptions();
  const [projectId, setProjectId] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const connect = useMutate((input: unknown) => api.post<Repository>('/repos', input), {
    invalidates: [['repos']],
    successMessage: (repo) => `${repo.fullName} connected. Syncing now…`,
    errorMessage: 'Could not connect the repository',
    onSuccess: () => {
      setRepoInput(''); setAccessToken(''); setErrors({});
      onClose();
    },
  });

  const submit = () => {
    const fullName = parseGitHubRepo(repoInput);
    const next: Record<string, string> = {};
    if (!projectId) next.projectId = 'Choose the project this repository belongs to.';
    if (!fullName) next.fullName = 'Enter owner/repository, or paste the GitHub URL.';
    if (accessToken.trim().length < 8) next.accessToken = 'Paste the access token from GitHub.';
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    // GitHub's own details (URL, default branch, visibility) replace these on
    // the server once the token is verified.
    const parsed = connectRepoSchema.safeParse({
      projectId, provider: 'GITHUB', name: fullName!.split('/')[1], fullName,
      url: `https://github.com/${fullName}`, accessToken: accessToken.trim(),
    });
    if (!parsed.success) {
      setErrors({ fullName: parsed.error.issues[0]?.message ?? 'Check the details.' });
      return;
    }
    setErrors({});
    connect.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect a GitHub repository"
      description="Branches, commits and pull requests sync every 10 minutes, or on demand."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={connect.isPending}>
            {connect.isPending ? 'Checking with GitHub…' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Project" required value={projectId} onChange={(e) => setProjectId(e.target.value)} error={errors.projectId}>
          <option value="">Select a project…</option>
          {(projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </Select>

        <TextInput
          label="Repository"
          required
          autoFocus
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          error={errors.fullName}
          placeholder="owner/repository or https://github.com/owner/repository"
          className="font-mono text-xs"
        />

        <TextInput
          label="Access token"
          required
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          error={errors.accessToken}
          placeholder="github_pat_…"
          autoComplete="off"
          hint="Checked with GitHub before it is saved. Stored encrypted and never shown again."
          icon={<Shield size={13} />}
        />

        <TokenHelp />

        <p className="text-2xs leading-relaxed text-[var(--ink-faint)]">
          Tip: mention a task like <code className="font-mono">{(projects ?? []).find((p) => p.id === projectId)?.key ?? 'XSP'}-12</code> in a
          commit message, branch name or pull request, and it shows up on that task.
        </p>
      </div>
    </Modal>
  );
}

/** Adds or replaces a repository's token; the old one is never shown. */
function TokenModal({ repo, onClose }: { repo: Repository; onClose: () => void }) {
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState<string | undefined>();
  const save = useMutate(
    (token: string) => api.patch<Repository>(`/repos/${repo.id}`, { accessToken: token }),
    {
      invalidates: [['repos']],
      successMessage: 'Token saved. Syncing now…',
      errorMessage: 'Could not save the token',
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={repo.hasCredentials ? 'Replace access token' : 'Add access token'}
      description={repo.fullName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => {
              if (accessToken.trim().length < 8) return setError('Paste the access token from GitHub.');
              setError(undefined);
              save.mutate(accessToken.trim());
            }}
          >
            {save.isPending ? 'Checking with GitHub…' : 'Save token'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput
          label="Access token"
          required
          autoFocus
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          error={error}
          placeholder="github_pat_…"
          autoComplete="off"
          icon={<Shield size={13} />}
          hint="Checked with GitHub before it replaces the current one."
        />
        <TokenHelp />
      </div>
    </Modal>
  );
}
