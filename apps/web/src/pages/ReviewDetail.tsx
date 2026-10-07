import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reviewVerdictSchema, type CodeReview, type ReviewComment } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { dateTime, pluralise, relativeTime } from '@/lib/format.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Avatar, UserChip } from '@/components/ui/Avatar.jsx';
import { Badge, Reference, ReviewStatusBadge } from '@/components/ui/Badge.jsx';
import { ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';
import { Modal } from '@/components/ui/Modal.jsx';
import { TextArea } from '@/components/ui/Field.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { Branch, Check, ChevronLeft, External, X } from '@/components/icons.jsx';

/**
 * Review detail.
 *
 * Inline comments are grouped by file so the discussion reads in the order the
 * code does, with general comments first. The merge button only appears when
 * the server would actually allow it — an approval exists and nothing is
 * outstanding — rather than failing on click.
 */
export function ReviewDetailPage() {
  const { id = '' } = useParams();
  const { allows, user } = useAuth();
  const [verdictOpen, setVerdictOpen] = useState<'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT' | null>(null);

  const { data: review, isLoading, error, refetch } = useQuery({
    queryKey: keys.review(id),
    queryFn: () => api.get<CodeReview>(`/reviews/${id}`),
    enabled: Boolean(id),
  });

  const { data: comments } = useQuery({
    queryKey: keys.reviewComments(id),
    queryFn: () => api.get<ReviewComment[]>(`/reviews/${id}/comments`),
    enabled: Boolean(id),
  });

  const merge = useMutate(() => api.post<CodeReview>(`/reviews/${id}/merge`), {
    invalidates: [keys.review(id), ['reviews'], ['tasks'], ['dashboard']],
    successMessage: 'Review merged',
  });

  const close = useMutate(() => api.post<CodeReview>(`/reviews/${id}/close`), {
    invalidates: [keys.review(id), ['reviews']],
    successMessage: 'Review closed',
  });

  const resolveComment = useMutate(
    ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      api.put<ReviewComment[]>(`/reviews/${id}/comments/${commentId}/resolved`, { resolved }),
    { invalidates: [keys.reviewComments(id), keys.review(id)] },
  );

  if (isLoading) return <LoadingState className="min-h-[60vh]" label="Loading review" />;
  if (error || !review) {
    return (
      <Page title="Review">
        <ErrorState title="Review not found" message="It may have been deleted, or you may not have access." onRetry={() => void refetch()} />
      </Page>
    );
  }

  const isAuthor = review.author.id === user?.id;
  const approved = review.reviewers.some((r) => r.verdict === 'APPROVED');
  const open = review.status !== 'MERGED' && review.status !== 'CLOSED';
  // Mirrors the server gate exactly, so the button is never offered in vain.
  const canMerge = open && allows('review:merge') && approved && review.status !== 'CHANGES_REQUESTED';

  const general = (comments ?? []).filter((comment) => !comment.filePath);
  const inline = (comments ?? []).filter((comment) => comment.filePath);
  const byFile = new Map<string, ReviewComment[]>();
  for (const comment of inline) {
    const list = byFile.get(comment.filePath!) ?? [];
    list.push(comment);
    byFile.set(comment.filePath!, list);
  }

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <Link to="/code-review" aria-label="Back to reviews" className="rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)]">
            <ChevronLeft size={16} />
          </Link>
          <span className="min-w-0">{review.title}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Reference>{review.reference}</Reference>
          <span className="flex items-center gap-1 font-mono text-2xs">
            <Branch size={11} />
            {review.sourceBranch} → {review.targetBranch}
          </span>
          <span>· opened {relativeTime(review.createdAt)} by {review.author.name}</span>
        </span>
      }
      actions={
        <>
          {review.externalUrl && (
            <Button
              variant={review.syncedFromGitHub && open ? 'primary' : 'ghost'}
              size="sm"
              icon={<External size={14} />}
              onClick={() => window.open(review.externalUrl!, '_blank', 'noopener,noreferrer')}
            >
              {review.syncedFromGitHub ? (open ? 'Merge on GitHub' : 'View on GitHub') : 'Pull request'}
            </Button>
          )}
          {open && !isAuthor && allows('review:comment') && (
            <>
              <Button variant="secondary" size="sm" icon={<X size={14} />} onClick={() => setVerdictOpen('REQUEST_CHANGES')}>
                Request changes
              </Button>
              <Button variant="primary" size="sm" icon={<Check size={14} />} onClick={() => setVerdictOpen('APPROVE')}>
                Approve
              </Button>
            </>
          )}
          {/* A GitHub pull request is merged or closed on GitHub; the sync
              brings the outcome back. */}
          {canMerge && !review.syncedFromGitHub && (
            <Button variant="primary" size="sm" loading={merge.isPending} onClick={() => merge.mutate(undefined as never)}>
              Merge
            </Button>
          )}
          {open && !review.syncedFromGitHub && (isAuthor || allows('review:merge')) && (
            <Button variant="ghost" size="sm" loading={close.isPending} onClick={() => close.mutate(undefined as never)}>
              Close
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {review.status === 'CHANGES_REQUESTED' && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-serious-wash)] px-3.5 py-2.5"
            >
              <span aria-hidden="true" className="text-[var(--status-serious-ink)]">⚠</span>
              <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
                Changes have been requested. The review cannot be merged until they are resolved.
              </p>
            </div>
          )}

          <Card>
            <CardHeader
              title="Description"
              action={
                <span className="font-mono text-2xs">
                  <span className="text-[var(--status-good-ink)]">+{review.additions}</span>{' '}
                  <span className="text-[var(--status-critical-ink)]">−{review.deletions}</span>{' '}
                  <span className="text-[var(--ink-faint)]">· {review.changedFiles} files</span>
                </span>
              }
            />
            <div className="mt-3">
              {review.description ? (
                <Markdown content={review.description} />
              ) : (
                <p className="text-xs text-[var(--ink-faint)] italic">No description was given.</p>
              )}
            </div>
          </Card>

          {byFile.size > 0 && (
            <Card>
              <CardHeader
                title="Inline comments"
                subtitle={`${pluralise(inline.length, 'comment')} across ${pluralise(byFile.size, 'file')}`}
              />
              <div className="mt-3 flex flex-col gap-4">
                {[...byFile.entries()].map(([file, fileComments]) => (
                  <div key={file}>
                    <h4 className="truncate-line rounded-t-[var(--radius-sm)] bg-[var(--surface-inset)] px-2.5 py-1.5 font-mono text-2xs text-[var(--ink-secondary)]">
                      {file}
                    </h4>
                    <ul className="flex flex-col gap-2 rounded-b-[var(--radius-sm)] bg-[var(--surface-inset)]/50 p-2.5">
                      {fileComments.map((comment) => (
                        <li
                          key={comment.id}
                          className={cn(
                            'rounded-[var(--radius-sm)] bg-[var(--surface-1)] p-2.5 ring-1 ring-inset',
                            comment.resolved ? 'opacity-60 ring-[var(--line-subtle)]' : 'ring-[var(--line)]',
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <Avatar user={comment.author} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-2">
                                <span className="text-xs font-semibold">{comment.author.name}</span>
                                {comment.line && (
                                  <span className="font-mono text-2xs text-[var(--ink-faint)]">
                                    line {comment.line}
                                  </span>
                                )}
                                <span className="text-2xs text-[var(--ink-faint)]">
                                  {relativeTime(comment.createdAt)}
                                </span>
                                {comment.resolved && <Badge tone="good" size="sm">Resolved</Badge>}
                              </div>
                              <div className="mt-1">
                                <Markdown content={comment.body} />
                              </div>
                            </div>
                            {allows('review:comment') && (
                              <IconButton
                                label={comment.resolved ? 'Reopen comment' : 'Mark resolved'}
                                size="xs"
                                onClick={() =>
                                  resolveComment.mutate({ commentId: comment.id, resolved: !comment.resolved })
                                }
                              >
                                <Check size={12} />
                              </IconButton>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={`Discussion${general.length ? ` (${general.length})` : ''}`} />
            {general.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--ink-faint)] italic">No general comments yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-4">
                {general.map((comment) => (
                  <li key={comment.id} className="flex gap-2.5">
                    <Avatar user={comment.author} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs font-semibold">{comment.author.name}</span>
                        <span className="text-2xs text-[var(--ink-faint)]">{relativeTime(comment.createdAt)}</span>
                      </div>
                      <div className="mt-1 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2">
                        <Markdown content={comment.body} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {open && allows('review:comment') && (
              <div className="mt-4">
                <Button variant="secondary" size="sm" fullWidth onClick={() => setVerdictOpen('COMMENT')}>
                  Add a comment
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <h3 className="text-xs font-medium text-[var(--ink-muted)]">Status</h3>
            <div className="mt-2"><ReviewStatusBadge status={review.status} size="md" /></div>
            {review.mergedAt && (
              <p className="mt-2 text-2xs text-[var(--ink-muted)]">Merged {dateTime(review.mergedAt)}</p>
            )}
            {open && !approved && (
              <p className="mt-2 text-2xs text-[var(--ink-muted)]">
                Needs at least one approval before it can be merged.
              </p>
            )}
          </Card>

          <Card>
            <h3 className="text-xs font-medium text-[var(--ink-muted)]">
              Reviewers ({review.reviewers.length})
            </h3>
            {review.reviewers.length === 0 ? (
              <p className="mt-2 text-2xs text-[var(--ink-faint)] italic">No reviewers assigned.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2.5">
                {review.reviewers.map((reviewer) => (
                  <li key={reviewer.user.id} className="flex items-center justify-between gap-2">
                    <UserChip user={reviewer.user} showPresence />
                    <Badge
                      tone={
                        reviewer.verdict === 'APPROVED'
                          ? 'good'
                          : reviewer.verdict === 'CHANGES_REQUESTED'
                            ? 'serious'
                            : reviewer.verdict === 'COMMENTED'
                              ? 'info'
                              : 'neutral'
                      }
                      size="sm"
                      dot
                    >
                      {reviewer.verdict === 'PENDING' ? 'Pending' : reviewer.verdict.toLowerCase().replace('_', ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <dl className="flex flex-col gap-2.5 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-2xs text-[var(--ink-muted)]">Author</dt>
                <dd><UserChip user={review.author} /></dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-2xs text-[var(--ink-muted)]">Unresolved</dt>
                <dd className="tabular-nums">{review.unresolvedCount}</dd>
              </div>
              {review.linkedTaskId && (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-2xs text-[var(--ink-muted)]">Task</dt>
                  <dd>
                    <Link to={`/tasks/${review.linkedTaskId}`} className="text-[var(--accent)] hover:underline">
                      View task
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>

      {verdictOpen && (
        <VerdictModal
          reviewId={id}
          verdict={verdictOpen}
          onClose={() => setVerdictOpen(null)}
        />
      )}
    </Page>
  );
}

function VerdictModal({
  reviewId, verdict, onClose,
}: {
  reviewId: string;
  verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | undefined>();

  const submit = useMutate(
    (input: unknown) => api.post<CodeReview>(`/reviews/${reviewId}/verdict`, input),
    {
      invalidates: [keys.review(reviewId), keys.reviewComments(reviewId), ['reviews'], ['dashboard']],
      successMessage:
        verdict === 'APPROVE' ? 'Review approved' : verdict === 'REQUEST_CHANGES' ? 'Changes requested' : 'Comment added',
      onSuccess: onClose,
    },
  );

  const titles = {
    APPROVE: 'Approve this review',
    REQUEST_CHANGES: 'Request changes',
    COMMENT: 'Add a comment',
  };

  const handleSubmit = () => {
    const parsed = reviewVerdictSchema.safeParse({ verdict, body: body || undefined });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    submit.mutate(parsed.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={titles[verdict]}
      description={
        verdict === 'REQUEST_CHANGES'
          ? 'Say what needs changing — the author is notified with your note.'
          : verdict === 'APPROVE'
            ? 'The author is notified. A comment is optional.'
            : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={verdict === 'REQUEST_CHANGES' ? 'danger' : 'primary'}
            loading={submit.isPending}
            onClick={handleSubmit}
          >
            {verdict === 'APPROVE' ? 'Approve' : verdict === 'REQUEST_CHANGES' ? 'Request changes' : 'Comment'}
          </Button>
        </>
      }
    >
      <TextArea
        label="Comment"
        autoFocus
        required={verdict === 'REQUEST_CHANGES'}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        error={error}
        rows={6}
        placeholder={
          verdict === 'REQUEST_CHANGES'
            ? 'What needs to change before this can be merged?'
            : 'Anything worth noting?'
        }
        hint="Markdown is supported."
      />
    </Modal>
  );
}
