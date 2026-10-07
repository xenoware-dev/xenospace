import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  REVIEW_STATUSES, REVIEW_STATUS_LABEL, createReviewSchema,
  type CodeReview, type Paginated, type Repository,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { pluralise, relativeTime } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Avatar, AvatarStack } from '@/components/ui/Avatar.jsx';
import { Badge, Reference, ReviewStatusBadge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ClearFilters, FilterSelect, Pagination, SearchField } from '@/components/ui/Toolbar.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { MemberPicker } from '@/components/MemberPicker.jsx';
import { Branch, Plus, Review as ReviewIcon, Git } from '@/components/icons.jsx';

/**
 * Code review queue.
 *
 * Opens on "waiting on me" by default, because that is the only question most
 * people have when they come here. The diff size is shown on every row: a
 * 40-line review and a 2,000-line review are not the same task.
 */
export function CodeReviewPage() {
  const { allows } = useAuth();
  const { data: projects } = useProjectOptions();
  const [createOpen, setCreateOpen] = useQueryFlag('new');

  const { filters, setFilter, clear, activeCount } = useFilters({
    q: '', projectId: '', status: '', reviewerId: 'me', authorId: '', page: '1',
  });

  const scope = filters.reviewerId === 'me' ? 'mine' : filters.authorId === 'me' ? 'authored' : 'all';

  const query = {
    q: filters.q || undefined,
    projectId: filters.projectId || undefined,
    status: filters.status || undefined,
    reviewerId: filters.reviewerId || undefined,
    authorId: filters.authorId || undefined,
    page: filters.page,
    pageSize: '25',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.reviews(query),
    queryFn: () => api.get<Paginated<CodeReview>>('/reviews', query),
  });

  const setScope = (next: 'mine' | 'authored' | 'all') => {
    if (next === 'mine') setFilter('reviewerId', 'me'), setFilter('authorId', '');
    else if (next === 'authored') setFilter('reviewerId', ''), setFilter('authorId', 'me');
    else setFilter('reviewerId', ''), setFilter('authorId', '');
  };

  return (
    <Page
      title="Code Review"
      description="Open reviews, their size, and who still needs to look."
      actions={
        allows('review:create') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            Open a review
          </Button>
        )
      }
      toolbar={
        <>
          <SegmentedControl
            value={scope}
            onChange={setScope}
            size="sm"
            options={[
              { value: 'mine', label: 'Waiting on me' },
              { value: 'authored', label: 'Mine' },
              { value: 'all', label: 'All' },
            ]}
          />
          <SearchField
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
            placeholder="Search reviews…"
            className="w-full sm:w-52"
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
            options={REVIEW_STATUSES.map((s) => ({ value: s, label: REVIEW_STATUS_LABEL[s] }))}
          />
          <ClearFilters count={activeCount} onClear={clear} />
        </>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : error ? (
        <ErrorState message="Reviews could not be loaded." onRetry={() => void refetch()} />
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={<ReviewIcon size={20} />}
          title={scope === 'mine' ? 'Your review queue is clear' : 'No reviews here'}
          message={
            scope === 'mine'
              ? 'Nothing is waiting on you. Nicely done.'
              : 'Open a review when a branch is ready for another pair of eyes.'
          }
          action={
            scope === 'mine' ? (
              <Button variant="secondary" onClick={() => setScope('all')}>See all reviews</Button>
            ) : allows('review:create') ? (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                Open a review
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3 xs-stagger">
            {data!.items.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </ul>
          <Pagination
            page={data!.page}
            totalPages={data!.totalPages}
            total={data!.total}
            pageSize={data!.pageSize}
            onPageChange={(next) => setFilter('page', String(next))}
          />
        </>
      )}

      <OpenReviewModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

function ReviewCard({ review }: { review: CodeReview }) {
  const total = review.additions + review.deletions;
  // Rough size bands, so a reviewer can pick a review that fits the time they
  // have rather than discovering the scale after opening it.
  const size = total > 1000 ? 'Large' : total > 300 ? 'Medium' : 'Small';
  const pending = review.reviewers.filter((r) => r.verdict === 'PENDING');

  return (
    <Card as="li" interactive className="p-0">
      <Link to={`/code-review/${review.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Reference>{review.reference}</Reference>
              <ReviewStatusBadge status={review.status} />
              {review.syncedFromGitHub && (
                <Badge tone="neutral" size="sm" icon={<Git size={9} />}>
                  GitHub #{review.externalNumber}
                </Badge>
              )}
              <Badge
                tone={size === 'Large' ? 'warning' : size === 'Medium' ? 'info' : 'neutral'}
                size="sm"
              >
                {size}
              </Badge>
              {review.unresolvedCount > 0 && (
                <Badge tone="serious" size="sm">
                  {pluralise(review.unresolvedCount, 'unresolved comment')}
                </Badge>
              )}
            </div>
            <h3 className="mt-1.5 truncate-line text-sm font-semibold text-[var(--ink-primary)]">
              {review.title}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-[var(--ink-muted)]">
              <span className="flex items-center gap-1 font-mono">
                <Branch size={11} />
                {review.sourceBranch}
                <span aria-hidden="true" className="text-[var(--ink-faint)]">→</span>
                {review.targetBranch}
              </span>
              <span>· {review.changedFiles} files</span>
              <span className="font-mono">
                <span className="text-[var(--status-good-ink)]">+{review.additions}</span>{' '}
                <span className="text-[var(--status-critical-ink)]">−{review.deletions}</span>
              </span>
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Avatar user={review.author} size="md" showPresence />
            <span className="text-2xs text-[var(--ink-faint)]">{relativeTime(review.updatedAt)}</span>
          </div>
        </div>

        {review.reviewers.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line-subtle)] pt-3">
            <span className="flex items-center gap-2">
              <span className="text-2xs text-[var(--ink-faint)]">Reviewers</span>
              <AvatarStack users={review.reviewers.map((r) => r.user)} size="xs" max={5} />
            </span>
            <span className="flex items-center gap-1.5">
              {review.reviewers.map((reviewer) => (
                <span
                  key={reviewer.user.id}
                  title={`${reviewer.user.name} — ${reviewer.verdict.toLowerCase().replace('_', ' ')}`}
                  className={cn(
                    'rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10px] font-medium',
                    reviewer.verdict === 'APPROVED' && 'bg-[var(--status-good-wash)] text-[var(--status-good-ink)]',
                    reviewer.verdict === 'CHANGES_REQUESTED' && 'bg-[var(--status-serious-wash)] text-[var(--status-serious-ink)]',
                    reviewer.verdict === 'COMMENTED' && 'bg-[var(--status-info-wash)] text-[var(--status-info-ink)]',
                    reviewer.verdict === 'PENDING' && 'bg-[var(--surface-3)] text-[var(--ink-faint)]',
                  )}
                >
                  {reviewer.verdict === 'APPROVED'
                    ? '✓'
                    : reviewer.verdict === 'CHANGES_REQUESTED'
                      ? '✗'
                      : reviewer.verdict === 'COMMENTED'
                        ? '💬'
                        : '…'}
                  <span className="sr-only-focusable">{reviewer.verdict}</span>
                </span>
              ))}
              {pending.length > 0 && (
                <span className="text-2xs text-[var(--ink-faint)]">{pending.length} pending</span>
              )}
            </span>
          </div>
        )}
      </Link>
    </Card>
  );
}

function OpenReviewModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: projects } = useProjectOptions();
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('main');
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: repos } = useQuery({
    queryKey: keys.repos(projectId),
    queryFn: () => api.get<Repository[]>('/repos', { projectId }),
    enabled: Boolean(projectId),
  });

  const create = useMutate((input: unknown) => api.post<CodeReview>('/reviews', input), {
    invalidates: [['reviews'], ['dashboard']],
    successMessage: (review) => `${review.reference} opened`,
    errorMessage: 'Could not open the review',
    onSuccess: () => {
      setTitle(''); setDescription(''); setSourceBranch(''); setReviewerIds([]); setExternalUrl('');
      setErrors({});
      onClose();
    },
  });

  const submit = () => {
    const parsed = createReviewSchema.safeParse({
      projectId,
      repositoryId: repos?.[0]?.id,
      title,
      description: description || undefined,
      sourceBranch,
      targetBranch,
      externalUrl: externalUrl || undefined,
      reviewerIds,
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
      title="Open a code review"
      description="Reviewers are notified straight away."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending} disabled={!projectId}>
            Open review
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
          label="Title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="Add fractional ranking to the board"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Source branch"
            required
            value={sourceBranch}
            onChange={(e) => setSourceBranch(e.target.value)}
            error={errors.sourceBranch}
            placeholder="feat/kanban-dnd"
            className="font-mono text-xs"
          />
          <TextInput
            label="Target branch"
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder={'### What\n\n### Why\n\n### Testing'}
          hint="Markdown is supported."
          className="font-mono text-xs"
        />

        <TextInput
          label="Pull request URL"
          type="url"
          value={externalUrl}
          onChange={(e) => setExternalUrl(e.target.value)}
          error={errors.externalUrl}
          placeholder="https://github.com/org/repo/pull/42"
          hint="Optional link to the upstream pull request."
        />

        <MemberPicker
          label="Reviewers"
          hint="You cannot review your own work, so you are excluded automatically."
          selected={reviewerIds}
          onChange={setReviewerIds}
          projectId={projectId || undefined}
          max={20}
        />
      </div>
    </Modal>
  );
}
