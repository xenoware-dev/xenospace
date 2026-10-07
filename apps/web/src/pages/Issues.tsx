import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ISSUE_KINDS, ISSUE_STATUSES, ISSUE_STATUS_LABEL, SEVERITIES, SEVERITY_LABEL,
  createIssueSchema, type Issue, type Paginated,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { relativeTime, titleCase } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge, IssueStatusBadge, Reference, SeverityBadge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ClearFilters, FilterSelect, Pagination, SearchField, ToolbarSpacer } from '@/components/ui/Toolbar.jsx';
import { Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { AssigneeSelect } from '@/components/MemberPicker.jsx';
import { Bug, Plus } from '@/components/icons.jsx';

/**
 * Issues and bugs.
 *
 * Open issues lead and are sorted by severity, because an S1 buried under
 * twenty trivial reports is the failure mode this page exists to prevent.
 */
export function IssuesPage() {
  const { allows, isAdmin } = useAuth();
  const { data: projects } = useProjectOptions();
  const [createOpen, setCreateOpen] = useQueryFlag('new');

  const { filters, setFilter, clear, activeCount } = useFilters({
    q: '',
    projectId: '',
    status: '',
    severity: '',
    kind: '',
    assigneeId: '',
    sort: 'severity',
    order: 'desc',
    page: '1',
  });

  const query = {
    q: filters.q || undefined,
    projectId: filters.projectId || undefined,
    status: filters.status || undefined,
    severity: filters.severity || undefined,
    kind: filters.kind || undefined,
    assigneeId: filters.assigneeId || undefined,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    pageSize: '25',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.issues(query),
    queryFn: () => api.get<Paginated<Issue>>('/issues', query),
  });

  const openCritical = data?.items.filter(
    (issue) => issue.severity === 'S1' && !['RESOLVED', 'CLOSED', 'WONT_FIX'].includes(issue.status),
  ).length ?? 0;

  return (
    <Page
      title="Issues & Bugs"
      description={isAdmin ? 'Everything reported across your projects.' : 'Issues you reported or are assigned.'}
      actions={
        allows('issue:create') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            Report an issue
          </Button>
        )
      }
      toolbar={
        <>
          <SearchField
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
            placeholder="Search issues…"
            className="w-full sm:w-56"
          />
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilter('status', value)}
            options={ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABEL[s] }))}
          />
          <FilterSelect
            label="Severity"
            value={filters.severity}
            onChange={(value) => setFilter('severity', value)}
            options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))}
          />
          <FilterSelect
            label="Kind"
            value={filters.kind}
            onChange={(value) => setFilter('kind', value)}
            options={ISSUE_KINDS.map((k) => ({ value: k, label: titleCase(k) }))}
          />
          <FilterSelect
            label="Assignee"
            value={filters.assigneeId}
            onChange={(value) => setFilter('assigneeId', value)}
            options={[
              { value: 'me', label: 'Me' },
              { value: 'unassigned', label: 'Unassigned' },
            ]}
          />
          <ClearFilters count={activeCount} onClear={clear} />
          <ToolbarSpacer />
        </>
      }
    >
      {openCritical > 0 && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-critical-wash)] px-3.5 py-2.5"
        >
          <span aria-hidden="true" className="text-[var(--status-critical-ink)]">⚠</span>
          <p className="text-xs text-[var(--ink-secondary)]">
            <strong className="text-[var(--status-critical-ink)]">
              {openCritical} critical {openCritical === 1 ? 'issue' : 'issues'}
            </strong>{' '}
            still open on this page.
          </p>
        </div>
      )}

      {isLoading ? (
        <Card padded={false}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="m-3 h-10" />
          ))}
        </Card>
      ) : error ? (
        <ErrorState message="Issues could not be loaded." onRetry={() => void refetch()} />
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={<Bug size={20} />}
          title={activeCount > 0 ? 'No issues match those filters' : 'No issues reported'}
          message={activeCount > 0 ? 'Try clearing a filter.' : 'Nothing is broken, or nothing has been reported yet.'}
          action={
            activeCount > 0 ? (
              <Button variant="secondary" onClick={clear}>Clear filters</Button>
            ) : allows('issue:create') ? (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                Report an issue
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-[var(--line-subtle)]">
              {data!.items.map((issue) => (
                <li key={issue.id}>
                  <Link
                    to={`/issues/${issue.id}`}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--wash-hover)] sm:px-4',
                      // A critical open issue gets a left edge so it is visible
                      // while scanning, not only on reading the badge.
                      issue.severity === 'S1' &&
                        !['RESOLVED', 'CLOSED', 'WONT_FIX'].includes(issue.status) &&
                        'border-l-2 border-l-[var(--status-critical)]',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <Reference>{issue.reference}</Reference>
                        {issue.project && (
                          <span className="hidden items-center gap-1 sm:flex">
                            <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: issue.project.color }} />
                            <span className="text-2xs text-[var(--ink-faint)]">{issue.project.key}</span>
                          </span>
                        )}
                        <Badge tone="neutral" size="sm">{titleCase(issue.kind)}</Badge>
                      </span>
                      <span className="mt-0.5 block truncate-line text-xs font-medium text-[var(--ink-primary)]">
                        {issue.title}
                      </span>
                    </span>

                    <span className="hidden shrink-0 lg:block">
                      <span className="text-2xs text-[var(--ink-faint)]">
                        {issue.commentCount > 0 && `${issue.commentCount} comments · `}
                        {relativeTime(issue.updatedAt)}
                      </span>
                    </span>

                    <SeverityBadge severity={issue.severity} />
                    <IssueStatusBadge status={issue.status} />

                    <span className="shrink-0">
                      {issue.assignee ? (
                        <Avatar user={issue.assignee} size="sm" showPresence />
                      ) : (
                        <span
                          title="Unassigned"
                          className="grid size-6 place-items-center rounded-full text-[var(--ink-faint)] ring-1 ring-dashed ring-[var(--line-strong)]"
                        >
                          <Plus size={10} />
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Pagination
            page={data!.page}
            totalPages={data!.totalPages}
            total={data!.total}
            pageSize={data!.pageSize}
            onPageChange={(next) => setFilter('page', String(next))}
          />
        </>
      )}

      <ReportIssueModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        defaultProjectId={filters.projectId || undefined}
      />
    </Page>
  );
}

function ReportIssueModal({
  open, onClose, defaultProjectId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
}) {
  const { data: projects } = useProjectOptions();
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Issue['kind']>('BUG');
  const [severity, setSeverity] = useState<Issue['severity']>('S3');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [environment, setEnvironment] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutate((input: unknown) => api.post<Issue>('/issues', input), {
    invalidates: [['issues'], ['dashboard']],
    successMessage: (issue) => `${issue.reference} reported`,
    errorMessage: 'Could not report the issue',
    onSuccess: () => {
      setTitle(''); setDescription(''); setSteps(''); setExpected(''); setActual('');
      setEnvironment(''); setErrors({});
      onClose();
    },
  });

  const submit = () => {
    const parsed = createIssueSchema.safeParse({
      projectId, title, description, kind, severity,
      assigneeId: assigneeId ?? undefined,
      stepsToReproduce: steps || undefined,
      expectedBehaviour: expected || undefined,
      actualBehaviour: actual || undefined,
      environment: environment || undefined,
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
      title="Report an issue"
      description="The more reproducible the report, the faster it gets fixed."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending} disabled={!projectId}>
            Report issue
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
          label="Summary"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="Board drops the card on a slow connection"
          maxLength={200}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Issue['kind'])}>
            {ISSUE_KINDS.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </Select>
          <Select
            label="Severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Issue['severity'])}
            hint={severity === 'S1' ? 'Notifies the whole project' : undefined}
          >
            {SEVERITIES.map((option) => (
              <option key={option} value={option}>{SEVERITY_LABEL[option]}</option>
            ))}
          </Select>
          <AssigneeSelect value={assigneeId} onChange={setAssigneeId} projectId={projectId || undefined} disabled={!projectId} />
        </div>

        <TextArea
          label="Description"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          rows={3}
          placeholder="What happened, and in what context?"
        />

        <TextArea
          label="Steps to reproduce"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={4}
          placeholder={'1. Open the board\n2. Drag a card\n3. Observe…'}
          className="font-mono text-xs"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextArea label="Expected" value={expected} onChange={(e) => setExpected(e.target.value)} rows={2} />
          <TextArea label="Actual" value={actual} onChange={(e) => setActual(e.target.value)} rows={2} />
        </div>

        <TextInput
          label="Environment"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          placeholder="Chrome 142 / macOS 15"
          hint="Browser, OS, device or build."
        />
      </div>
    </Modal>
  );
}
