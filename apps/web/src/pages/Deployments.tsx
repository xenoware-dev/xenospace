import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DEPLOY_ENVIRONMENTS, DEPLOY_STATUSES, DEPLOY_STATUS_LABEL,
  createDeploymentSchema, type Deployment, type Paginated, type Repository,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { percent, relativeTime, seconds, shortSha, titleCase } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Badge, DeployStatusBadge } from '@/components/ui/Badge.jsx';
import { Progress } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { ClearFilters, FilterSelect, Pagination } from '@/components/ui/Toolbar.jsx';
import { Deploy, External, Plus, Shield } from '@/components/icons.jsx';

interface EnvironmentStatus {
  environment: string;
  current: Deployment | null;
  successRate: number;
  total: number;
  lastFailureAt: string | null;
}

/**
 * Deployments.
 *
 * The three environment cards lead, because "what is in production right now"
 * is the question this page exists to answer. The history below is secondary.
 */
export function DeploymentsPage() {
  const { allows, isAdmin } = useAuth();
  const { data: projects } = useProjectOptions();
  const [createOpen, setCreateOpen] = useQueryFlag('new');
  const [rollingBack, setRollingBack] = useState<Deployment | null>(null);

  const { filters, setFilter, clear, activeCount } = useFilters({
    projectId: '', environment: '', status: '', page: '1',
  });

  const query = {
    projectId: filters.projectId || undefined,
    environment: filters.environment || undefined,
    status: filters.status || undefined,
    page: filters.page,
    pageSize: '25',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.deployments(query),
    queryFn: () => api.get<Paginated<Deployment>>('/deployments', query),
  });

  const { data: environments } = useQuery({
    queryKey: keys.environments(filters.projectId || undefined),
    queryFn: () => api.get<EnvironmentStatus[]>('/deployments/environments', {
      projectId: filters.projectId || undefined,
    }),
  });

  const rollback = useMutate((id: string) => api.post<Deployment>(`/deployments/${id}/rollback`), {
    invalidates: [['deployments'], ['dashboard']],
    successMessage: 'Rollback queued',
    onSuccess: () => setRollingBack(null),
  });

  return (
    <Page
      title="Deployments"
      description="What is running where, and the release history behind it."
      actions={
        allows('deploy:create') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            New deployment
          </Button>
        )
      }
      toolbar={
        <>
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          <FilterSelect
            label="Environment"
            value={filters.environment}
            onChange={(value) => setFilter('environment', value)}
            options={DEPLOY_ENVIRONMENTS.map((e) => ({ value: e, label: titleCase(e) }))}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilter('status', value)}
            options={DEPLOY_STATUSES.map((s) => ({ value: s, label: DEPLOY_STATUS_LABEL[s] }))}
          />
          <ClearFilters count={activeCount} onClear={clear} />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* -------------------------------------------- environment summary */}
        <div className="grid gap-3 md:grid-cols-3">
          {(environments ?? []).map((env) => (
            <EnvironmentCard key={env.environment} env={env} />
          ))}
          {!environments && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36" />)}
        </div>

        {/* ----------------------------------------------------- history */}
        <Card padded={false}>
          <div className="px-4 pt-4">
            <CardHeader title="Release history" subtitle={data ? `${data.total} deployments` : undefined} />
          </div>

          {isLoading ? (
            <div className="p-4">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mb-2 h-12" />)}
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorState message="Deployments could not be loaded." onRetry={() => void refetch()} />
            </div>
          ) : data!.items.length === 0 ? (
            <EmptyState
              icon={<Deploy size={20} />}
              title="No deployments recorded"
              message={
                allows('deploy:create')
                  ? 'Record a deployment to start tracking what is running where.'
                  : 'Nothing has been deployed for these projects yet.'
              }
            />
          ) : (
            <>
              <ul className="mt-2 divide-y divide-[var(--line-subtle)]">
                {data!.items.map((deployment) => (
                  <li key={deployment.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="h-8 w-0.5 shrink-0 rounded-full"
                      style={{ background: ENV_COLOR[deployment.environment] }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{deployment.version}</span>
                        <Badge tone="neutral" size="sm">{titleCase(deployment.environment)}</Badge>
                        {deployment.commitSha && (
                          <code className="rounded-[var(--radius-xs)] bg-[var(--surface-3)] px-1.5 font-mono text-[10px] text-[var(--ink-muted)]">
                            {shortSha(deployment.commitSha)}
                          </code>
                        )}
                        {deployment.approvedBy && (
                          <Badge tone="good" size="sm" icon={<Shield size={9} />}>Approved</Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
                        {relativeTime(deployment.createdAt)} by {deployment.triggeredBy.name}
                        {deployment.durationSeconds !== null && ` · ${seconds(deployment.durationSeconds)}`}
                      </span>
                      {deployment.notes && (
                        <span className="mt-1 block text-2xs text-[var(--ink-faint)] italic">{deployment.notes}</span>
                      )}
                    </span>

                    <DeployStatusBadge status={deployment.status} />

                    {deployment.logUrl && (
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<External size={11} />}
                        onClick={() => window.open(deployment.logUrl!, '_blank', 'noopener,noreferrer')}
                      >
                        Logs
                      </Button>
                    )}

                    {deployment.status === 'SUCCEEDED' &&
                      allows('deploy:rollback') &&
                      (isAdmin || deployment.environment !== 'PRODUCTION') && (
                        <Button variant="secondary" size="xs" onClick={() => setRollingBack(deployment)}>
                          Roll back
                        </Button>
                      )}
                  </li>
                ))}
              </ul>
              <div className="px-4 pb-4">
                <Pagination
                  page={data!.page}
                  totalPages={data!.totalPages}
                  total={data!.total}
                  pageSize={data!.pageSize}
                  onPageChange={(next) => setFilter('page', String(next))}
                />
              </div>
            </>
          )}
        </Card>
      </div>

      <CreateDeploymentModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <ConfirmDialog
        open={rollingBack !== null}
        onClose={() => setRollingBack(null)}
        onConfirm={() => rollingBack && rollback.mutate(rollingBack.id)}
        title={`Roll back ${rollingBack?.environment.toLowerCase() ?? ''}?`}
        message={`This marks ${rollingBack?.version ?? ''} as rolled back and queues a redeploy of the previous successful version.`}
        confirmLabel="Roll back"
        loading={rollback.isPending}
      />
    </Page>
  );
}

const ENV_COLOR: Record<string, string> = {
  DEVELOPMENT: 'var(--status-info)',
  STAGING: 'var(--status-warning)',
  PRODUCTION: 'var(--status-good)',
};

function EnvironmentCard({ env }: { env: EnvironmentStatus }) {
  const healthy = env.successRate >= 90;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: ENV_COLOR[env.environment] }} />
            <h3 className="text-sm font-semibold">{titleCase(env.environment)}</h3>
          </span>
          {env.current ? (
            <p className="mt-1.5 font-mono text-lg font-semibold tracking-tight">{env.current.version}</p>
          ) : (
            <p className="mt-1.5 text-xs text-[var(--ink-faint)] italic">Nothing deployed</p>
          )}
        </div>
        {env.current && <DeployStatusBadge status={env.current.status} />}
      </div>

      {env.current && (
        <p className="mt-1 text-2xs text-[var(--ink-muted)]">
          {relativeTime(env.current.createdAt)} · {env.current.triggeredBy.name}
        </p>
      )}

      <div className="mt-3 border-t border-[var(--line-subtle)] pt-3">
        <div className="mb-1.5 flex items-baseline justify-between text-2xs">
          <span className="text-[var(--ink-muted)]">Success rate</span>
          <span className={cn('font-medium tabular-nums', healthy ? 'text-[var(--status-good-ink)]' : 'text-[var(--status-warning-ink)]')}>
            {percent(env.successRate)}
          </span>
        </div>
        <Progress value={env.successRate} size="xs" tone={healthy ? 'good' : 'warning'} label={`${env.environment} success rate`} />
        <p className="mt-1.5 text-[10px] text-[var(--ink-faint)]">
          {env.total} deployments
          {env.lastFailureAt && ` · last failure ${relativeTime(env.lastFailureAt)}`}
        </p>
      </div>
    </Card>
  );
}

function CreateDeploymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAdmin } = useAuth();
  const { data: projects } = useProjectOptions();
  const [projectId, setProjectId] = useState('');
  const [environment, setEnvironment] = useState<Deployment['environment']>('STAGING');
  const [version, setVersion] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [branch, setBranch] = useState('main');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: repos } = useQuery({
    queryKey: keys.repos(projectId),
    queryFn: () => api.get<Repository[]>('/repos', { projectId }),
    enabled: Boolean(projectId),
  });

  const create = useMutate((input: unknown) => api.post<Deployment>('/deployments', input), {
    invalidates: [['deployments'], ['dashboard']],
    successMessage: 'Deployment queued',
    errorMessage: 'Could not queue the deployment',
    onSuccess: () => {
      setVersion(''); setCommitSha(''); setNotes(''); setErrors({});
      onClose();
    },
  });

  const submit = () => {
    const parsed = createDeploymentSchema.safeParse({
      projectId,
      repositoryId: repos?.[0]?.id ?? undefined,
      environment,
      version,
      commitSha: commitSha || undefined,
      branch: branch || undefined,
      notes: notes || undefined,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New deployment"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending} disabled={!projectId}>
            Queue deployment
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

        <Select
          label="Environment"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as Deployment['environment'])}
          hint={
            environment === 'PRODUCTION'
              ? isAdmin
                ? 'You are approving this production release.'
                : 'Only a team lead can deploy to production.'
              : undefined
          }
        >
          {DEPLOY_ENVIRONMENTS.map((option) => (
            <option key={option} value={option} disabled={option === 'PRODUCTION' && !isAdmin}>
              {titleCase(option)}
              {option === 'PRODUCTION' && !isAdmin ? ' — team lead only' : ''}
            </option>
          ))}
        </Select>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Version"
            required
            autoFocus
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            error={errors.version}
            placeholder="1.5.0"
            className="font-mono text-xs"
          />
          <TextInput
            label="Branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <TextInput
          label="Commit SHA"
          value={commitSha}
          onChange={(e) => setCommitSha(e.target.value)}
          error={errors.commitSha}
          placeholder="a1b2c3d"
          hint="Optional, 7–40 hex characters."
          className="font-mono text-xs"
        />

        <TextArea
          label="Release notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What is going out in this release?"
        />

        {environment === 'PRODUCTION' && isAdmin && (
          <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-warning-wash)] px-3 py-2 text-2xs leading-relaxed text-[var(--ink-secondary)]">
            <Shield size={13} className="mt-0.5 shrink-0 text-[var(--status-warning-ink)]" />
            Production deployments notify every project member and are recorded in the audit log
            against your account.
          </p>
        )}
      </div>
    </Modal>
  );
}
