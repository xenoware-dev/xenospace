import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ISSUE_STATUSES, ISSUE_STATUS_LABEL, SEVERITIES, SEVERITY_LABEL,
  resolveIssueSchema, type Comment, type Issue,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { dateTime, relativeTime, titleCase } from '@/lib/format.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge, IssueStatusBadge, Reference, SeverityBadge } from '@/components/ui/Badge.jsx';
import { ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea } from '@/components/ui/Field.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { CommentThread } from '@/components/CommentThread.jsx';
import { AssigneeSelect } from '@/components/MemberPicker.jsx';
import { Check, ChevronLeft, Trash } from '@/components/icons.jsx';

/** Issue detail, with the reproduction report kept in distinct sections. */
export function IssueDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { allows, user } = useAuth();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: issue, isLoading, error, refetch } = useQuery({
    queryKey: keys.issue(id),
    queryFn: () => api.get<Issue>(`/issues/${id}`),
    enabled: Boolean(id),
  });

  const { data: comments } = useQuery({
    queryKey: keys.issueComments(id),
    queryFn: () => api.get<Comment[]>(`/issues/${id}/comments`),
    enabled: Boolean(id),
  });

  const update = useMutate((input: unknown) => api.patch<Issue>(`/issues/${id}`, input), {
    invalidates: [['issues'], ['dashboard']],
    successMessage: 'Issue updated',
  });

  const remove = useMutate(() => api.delete(`/issues/${id}`), {
    invalidates: [['issues'], ['dashboard']],
    successMessage: 'Issue deleted',
    onSuccess: () => navigate('/issues', { replace: true }),
  });

  const addComment = useMutate(
    (body: string) => api.post<Comment>(`/issues/${id}/comments`, { body, mentions: [] }),
    { invalidates: [keys.issueComments(id), keys.issue(id)] },
  );

  if (isLoading) return <LoadingState className="min-h-[60vh]" label="Loading issue" />;
  if (error || !issue) {
    return (
      <Page title="Issue">
        <ErrorState title="Issue not found" message="It may have been deleted, or you may not have access." onRetry={() => void refetch()} />
      </Page>
    );
  }

  const canEdit = allows('issue:update') || issue.assignee?.id === user?.id || issue.reporter.id === user?.id;
  const resolved = ['RESOLVED', 'CLOSED', 'WONT_FIX'].includes(issue.status);

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <Link to="/issues" aria-label="Back to issues" className="rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink-primary)]">
            <ChevronLeft size={16} />
          </Link>
          <span className="min-w-0">{issue.title}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Reference>{issue.reference}</Reference>
          {issue.project && (
            <Link to={`/projects/${issue.projectId}`} className="hover:underline">{issue.project.name}</Link>
          )}
          <span>· reported {relativeTime(issue.createdAt)} by {issue.reporter.name}</span>
        </span>
      }
      actions={
        <>
          {!resolved && allows('issue:close') && canEdit && (
            <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={() => setResolveOpen(true)}>
              Resolve
            </Button>
          )}
          {allows('issue:delete') && (
            <IconButton label="Delete issue" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash size={15} />
            </IconButton>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {issue.resolution && (
            <Card className="ring-[var(--status-good)]/25">
              <CardHeader
                title="Resolution"
                subtitle={issue.resolvedAt ? `Resolved ${relativeTime(issue.resolvedAt)}` : undefined}
              />
              <div className="mt-2">
                <Markdown content={issue.resolution} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Description" />
            <div className="mt-3">
              <Markdown content={issue.description} />
            </div>
          </Card>

          {(issue.stepsToReproduce || issue.expectedBehaviour || issue.actualBehaviour) && (
            <Card>
              <CardHeader title="Reproduction" />
              <div className="mt-3 flex flex-col gap-4">
                {issue.stepsToReproduce && (
                  <Section title="Steps to reproduce">
                    <Markdown content={issue.stepsToReproduce} />
                  </Section>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {issue.expectedBehaviour && (
                    <Section title="Expected" tone="good">
                      <Markdown content={issue.expectedBehaviour} />
                    </Section>
                  )}
                  {issue.actualBehaviour && (
                    <Section title="Actual" tone="critical">
                      <Markdown content={issue.actualBehaviour} />
                    </Section>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={`Discussion${comments?.length ? ` (${comments.length})` : ''}`} />
            <div className="mt-3">
              <CommentThread
                comments={comments ?? []}
                onSubmit={(body) => addComment.mutateAsync(body).then(() => undefined)}
                submitting={addComment.isPending}
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <dl className="flex flex-col gap-3 text-xs">
              <Row label="Status"><IssueStatusBadge status={issue.status} /></Row>
              <Row label="Severity"><SeverityBadge severity={issue.severity} /></Row>
              <Row label="Kind"><Badge tone="neutral">{titleCase(issue.kind)}</Badge></Row>
              <Row label="Assignee">
                {issue.assignee ? <UserChip user={issue.assignee} showPresence /> : <span className="text-[var(--ink-faint)]">Unassigned</span>}
              </Row>
              <Row label="Reporter"><UserChip user={issue.reporter} /></Row>
              {issue.environment && <Row label="Environment"><span className="font-mono text-2xs">{issue.environment}</span></Row>}
              {issue.affectedVersion && <Row label="Version"><span className="font-mono text-2xs">{issue.affectedVersion}</span></Row>}
              {issue.linkedTaskId && (
                <Row label="Linked task">
                  <Link to={`/tasks/${issue.linkedTaskId}`} className="text-[var(--accent)] hover:underline">
                    View task
                  </Link>
                </Row>
              )}
              <Row label="Reported"><span>{dateTime(issue.createdAt)}</span></Row>
            </dl>
          </Card>

          {canEdit && allows('issue:update') && (
            <Card>
              <h3 className="mb-3 text-xs font-medium text-[var(--ink-muted)]">
                Triage
              </h3>
              <div className="flex flex-col gap-3">
                <Select
                  label="Status"
                  value={issue.status}
                  onChange={(event) => update.mutate({ status: event.target.value })}
                >
                  {ISSUE_STATUSES.map((status) => (
                    <option key={status} value={status}>{ISSUE_STATUS_LABEL[status]}</option>
                  ))}
                </Select>
                <Select
                  label="Severity"
                  value={issue.severity}
                  onChange={(event) => update.mutate({ severity: event.target.value })}
                >
                  {SEVERITIES.map((severity) => (
                    <option key={severity} value={severity}>{SEVERITY_LABEL[severity]}</option>
                  ))}
                </Select>
                <AssigneeSelect
                  value={issue.assignee?.id ?? null}
                  onChange={(next) => update.mutate({ assigneeId: next })}
                  projectId={issue.projectId}
                />
              </div>
            </Card>
          )}
        </div>
      </div>

      <ResolveModal open={resolveOpen} onClose={() => setResolveOpen(false)} issueId={id} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate(undefined as never)}
        title={`Delete ${issue.reference}?`}
        message="This removes the issue and its discussion. It cannot be undone."
        loading={remove.isPending}
      />
    </Page>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-2xs text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-[var(--ink-secondary)]">{children}</dd>
    </div>
  );
}

function Section({
  title, tone = 'neutral', children,
}: {
  title: string;
  tone?: 'neutral' | 'good' | 'critical';
  children: React.ReactNode;
}) {
  const border = {
    neutral: 'var(--line)',
    good: 'var(--status-good)',
    critical: 'var(--status-critical)',
  }[tone];
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: border }}>
      <h4 className="text-xs font-medium text-[var(--ink-muted)]">{title}</h4>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ResolveModal({ open, onClose, issueId }: { open: boolean; onClose: () => void; issueId: string }) {
  const [resolution, setResolution] = useState('');
  const [status, setStatus] = useState<'RESOLVED' | 'CLOSED' | 'WONT_FIX'>('RESOLVED');

  const resolve = useMutate(
    (input: unknown) => api.post<Issue>(`/issues/${issueId}/resolve`, input),
    {
      invalidates: [['issues'], ['dashboard']],
      successMessage: 'Issue resolved',
      onSuccess: () => {
        setResolution('');
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resolve issue"
      description="The reporter is notified with whatever you write here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={resolve.isPending}
            disabled={!resolution.trim()}
            onClick={() => resolve.mutate(resolveIssueSchema.parse({ resolution, status }))}
          >
            Resolve
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Outcome" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="RESOLVED">Resolved — fixed</option>
          <option value="CLOSED">Closed — no longer relevant</option>
          <option value="WONT_FIX">Won't fix — working as intended</option>
        </Select>
        <TextArea
          label="Resolution"
          required
          autoFocus
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={5}
          placeholder="What was the cause, and what changed?"
          hint="Markdown is supported."
        />
      </div>
    </Modal>
  );
}
