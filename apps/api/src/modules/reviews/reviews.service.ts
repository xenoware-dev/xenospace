import type { CodeReview, Paginated, ReviewComment } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { paginate } from '../../lib/http.js';
import { recordActivity } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import type { Principal } from '../../middleware/authenticate.js';
import { applyProjectScope, assertProjectAccess, WhereBuilder } from '../common/access.js';

const REVIEW_SELECT = `
  SELECT cr.id, cr.project_id, cr.repository_id, cr.number, cr.title, cr.description, cr.status,
         cr.source_branch, cr.target_branch, cr.external_number, cr.external_url,
         cr.additions, cr.deletions, cr.changed_files, cr.linked_task_id,
         cr.created_at, cr.updated_at, cr.merged_at, cr.external_author, cr.external_author_avatar,
         (cr.external_number IS NOT NULL AND rp.provider = 'GITHUB' AND rp.access_token_enc IS NOT NULL) AS synced_from_github,
         p.key AS project_key,
         ${userJoinColumns('au', 'author')},
         (SELECT count(*)::int FROM review_comments rc WHERE rc.review_id = cr.id AND rc.deleted_at IS NULL) AS comment_count,
         (SELECT count(*)::int FROM review_comments rc
            WHERE rc.review_id = cr.id AND rc.deleted_at IS NULL AND rc.resolved = false
              AND rc.file_path IS NOT NULL) AS unresolved_count
    FROM code_reviews cr
    JOIN projects p ON p.id = cr.project_id
    LEFT JOIN users au ON au.id = cr.author_id
    LEFT JOIN repositories rp ON rp.id = cr.repository_id
`;

function mapReview(row: Record<string, unknown>): CodeReview {
  return {
    id: row.id as string,
    reference: `${row.project_key as string}-PR${row.number as number}`,
    projectId: row.project_id as string,
    repositoryId: (row.repository_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    status: row.status as CodeReview['status'],
    author: nestedUser(row, 'author') ?? {
      // A GitHub author with no XenoSpace account is shown by their login.
      id: 'unknown',
      name: row.external_author ? `@${row.external_author as string}` : 'Former member',
      email: '', role: 'DEVELOPER', status: row.external_author ? 'ACTIVE' : 'DEACTIVATED',
      avatarUrl: (row.external_author_avatar as string | null) ?? null, avatarColor: '#94a3b8',
      jobTitle: row.external_author ? 'GitHub' : null, presence: 'OFFLINE', lastSeenAt: null,
    },
    reviewers: [],
    sourceBranch: row.source_branch as string,
    targetBranch: row.target_branch as string,
    externalNumber: (row.external_number as number | null) ?? null,
    externalUrl: (row.external_url as string | null) ?? null,
    additions: (row.additions as number) ?? 0,
    deletions: (row.deletions as number) ?? 0,
    changedFiles: (row.changed_files as number) ?? 0,
    commentCount: (row.comment_count as number) ?? 0,
    unresolvedCount: (row.unresolved_count as number) ?? 0,
    linkedTaskId: (row.linked_task_id as string | null) ?? null,
    syncedFromGitHub: Boolean(row.synced_from_github),
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
    mergedAt: iso(row.merged_at as string | null),
  };
}

/** Loads reviewer verdicts for a page of reviews in one query. */
async function attachReviewers(reviews: CodeReview[]): Promise<void> {
  if (reviews.length === 0) return;
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT rr.review_id, rr.verdict, rr.responded_at, ${userJoinColumns('u', 'u')}
       FROM review_reviewers rr JOIN users u ON u.id = rr.user_id
      WHERE rr.review_id = ANY($1::uuid[])`,
    [reviews.map((r) => r.id)],
  );
  const byReview = new Map<string, CodeReview['reviewers']>();
  for (const row of rows) {
    const list = byReview.get(row.review_id as string) ?? [];
    list.push({
      user: nestedUser(row, 'u')!,
      verdict: row.verdict as 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
      respondedAt: iso(row.responded_at as string | null),
    });
    byReview.set(row.review_id as string, list);
  }
  for (const review of reviews) review.reviewers = byReview.get(review.id) ?? [];
}

export async function listReviews(
  actor: Principal,
  f: { page: number; pageSize: number; projectId?: string; authorId?: string; reviewerId?: string; status?: string[]; q?: string },
): Promise<Paginated<CodeReview>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'cr.project_id');
  where.addIf(f.projectId, `cr.project_id = ?`, f.projectId);
  where.addIf(f.status, `cr.status = ANY(?::text[])`, f.status);
  where.addIf(f.q, `cr.title ILIKE ?`, `%${f.q}%`);

  if (f.authorId === 'me') where.add(`cr.author_id = ?`, actor.id);
  else if (f.authorId) where.add(`cr.author_id = ?`, f.authorId);

  const reviewerId = f.reviewerId === 'me' ? actor.id : f.reviewerId;
  where.addIf(
    reviewerId,
    `EXISTS (SELECT 1 FROM review_reviewers rr WHERE rr.review_id = cr.id AND rr.user_id = ?)`,
    reviewerId,
  );

  const offset = (f.page - 1) * f.pageSize;
  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${REVIEW_SELECT} ${where.sql} ORDER BY cr.updated_at DESC LIMIT ${f.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM code_reviews cr JOIN projects p ON p.id = cr.project_id ${where.sql}`,
      where.params,
    ),
  ]);

  const reviews = rows.map(mapReview);
  await attachReviewers(reviews);
  return paginate(reviews, counts[0]?.n ?? 0, f.page, f.pageSize);
}

export async function getReview(actor: Principal, id: string): Promise<CodeReview> {
  const { rows } = await db().query<Record<string, unknown>>(`${REVIEW_SELECT} WHERE cr.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Review');
  await assertProjectAccess(actor, row.project_id as string);
  const review = mapReview(row);
  await attachReviewers([review]);
  return review;
}

export async function createReview(actor: Principal, input: Record<string, unknown>): Promise<CodeReview> {
  const projectId = input.projectId as string;
  await assertProjectAccess(actor, projectId);

  const id = await db().transaction(async (tx) => {
    const { rows: counter } = await tx.query<{ task_counter: number }>(
      `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
      [projectId],
    );
    const number = counter[0]?.task_counter;
    if (!number) throw notFound('Project');

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO code_reviews (project_id, repository_id, number, title, description, author_id,
                                 source_branch, target_branch, external_number, external_url,
                                 additions, deletions, changed_files, linked_task_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [
        projectId, input.repositoryId ?? null, number, input.title, input.description ?? null, actor.id,
        input.sourceBranch, input.targetBranch ?? 'main', input.externalNumber ?? null,
        input.externalUrl ?? null, input.additions ?? 0, input.deletions ?? 0,
        input.changedFiles ?? 0, input.linkedTaskId ?? null,
      ],
    );
    const reviewId = rows[0]!.id;

    for (const userId of ((input.reviewerIds as string[]) ?? []).slice(0, 20)) {
      // The author cannot be their own reviewer; an approval must come from
      // someone else for the gate to mean anything.
      if (userId === actor.id) continue;
      await tx.query(
        `INSERT INTO review_reviewers (review_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [reviewId, userId],
      );
    }

    await recordActivity(
      { actorId: actor.id, action: 'review.opened', entityType: 'review', entityId: reviewId, entityLabel: input.title as string, projectId },
      tx,
    );
    return reviewId;
  });

  const review = await getReview(actor, id);
  await notify({
    userIds: review.reviewers.map((r) => r.user.id),
    kind: 'REVIEW_REQUESTED',
    title: `Review requested: ${review.reference}`,
    body: review.title,
    link: `/code-review/${id}`,
    actorId: actor.id,
  });
  return review;
}

/**
 * Records a reviewer's verdict and derives the review's overall status.
 *
 * "Changes requested" outranks approval: one unresolved objection holds the
 * review, regardless of how many approvals it has.
 */
export async function submitVerdict(
  actor: Principal,
  id: string,
  input: { verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body?: string },
): Promise<CodeReview> {
  const review = await getReview(actor, id);
  if (review.author.id === actor.id && input.verdict !== 'COMMENT') {
    throw forbidden('You cannot approve your own review.');
  }
  if (review.status === 'MERGED' || review.status === 'CLOSED') {
    throw conflict('This review is already closed.');
  }

  const verdict = input.verdict === 'APPROVE'
    ? 'APPROVED'
    : input.verdict === 'REQUEST_CHANGES'
      ? 'CHANGES_REQUESTED'
      : 'COMMENTED';

  await db().transaction(async (tx) => {
    // A non-reviewer commenting is added as a reviewer, matching how review
    // tools treat drive-by feedback.
    await tx.query(
      `INSERT INTO review_reviewers (review_id, user_id, verdict, responded_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (review_id, user_id) DO UPDATE SET verdict = EXCLUDED.verdict, responded_at = now()`,
      [id, actor.id, verdict],
    );

    if (input.body) {
      await tx.query(
        `INSERT INTO review_comments (review_id, author_id, body) VALUES ($1,$2,$3)`,
        [id, actor.id, input.body],
      );
    }

    const { rows: verdicts } = await tx.query<{ verdict: string; n: number }>(
      `SELECT verdict, count(*)::int AS n FROM review_reviewers WHERE review_id = $1 GROUP BY verdict`,
      [id],
    );
    const tally = new Map(verdicts.map((v) => [v.verdict, v.n]));
    const status = (tally.get('CHANGES_REQUESTED') ?? 0) > 0
      ? 'CHANGES_REQUESTED'
      : (tally.get('APPROVED') ?? 0) > 0
        ? 'APPROVED'
        : 'OPEN';

    await tx.query(`UPDATE code_reviews SET status = $2 WHERE id = $1`, [id, status]);
    await recordActivity(
      { actorId: actor.id, action: `review.${verdict.toLowerCase()}`, entityType: 'review', entityId: id, entityLabel: review.title, projectId: review.projectId },
      tx,
    );
  });

  await notify({
    userIds: [review.author.id],
    kind: input.verdict === 'APPROVE' ? 'REVIEW_APPROVED' : 'REVIEW_CHANGES',
    title: `${actor.name} ${input.verdict === 'APPROVE' ? 'approved' : input.verdict === 'REQUEST_CHANGES' ? 'requested changes on' : 'commented on'} ${review.reference}`,
    body: input.body?.slice(0, 140) ?? review.title,
    link: `/code-review/${id}`,
    actorId: actor.id,
  });

  return getReview(actor, id);
}

/**
 * Marks a review merged.
 *
 * Requires an approval and no outstanding change requests — the same gate a
 * protected branch would apply, enforced here so the record cannot claim a
 * merge that was never reviewed.
 */
/** A review mirroring a GitHub pull request is merged or closed on GitHub, not here. */
function assertManagedHere(review: CodeReview, action: string): void {
  if (review.syncedFromGitHub) {
    throw conflict(`This pull request lives on GitHub. ${action} it there; the next sync brings the result here.`);
  }
}

export async function mergeReview(actor: Principal, id: string): Promise<CodeReview> {
  const review = await getReview(actor, id);
  if (review.status === 'MERGED') return review;
  assertManagedHere(review, 'Merge');
  if (review.status === 'CHANGES_REQUESTED') {
    throw conflict('Resolve the requested changes before merging.');
  }
  if (!review.reviewers.some((r) => r.verdict === 'APPROVED')) {
    throw conflict('This review needs at least one approval before it can be merged.');
  }

  await db().transaction(async (tx) => {
    await tx.query(`UPDATE code_reviews SET status = 'MERGED', merged_at = now() WHERE id = $1`, [id]);
    // Merging the work that implements a task moves the task along with it.
    if (review.linkedTaskId) {
      await tx.query(
        `UPDATE tasks SET status = 'DONE' WHERE id = $1 AND status IN ('IN_REVIEW', 'IN_PROGRESS')`,
        [review.linkedTaskId],
      );
    }
    await recordActivity(
      { actorId: actor.id, action: 'review.merged', entityType: 'review', entityId: id, entityLabel: review.title, projectId: review.projectId },
      tx,
    );
  });

  await notify({
    userIds: [review.author.id, ...review.reviewers.map((r) => r.user.id)],
    kind: 'SYSTEM', title: `${review.reference} merged`, body: review.title,
    link: `/code-review/${id}`, actorId: actor.id,
  });

  return getReview(actor, id);
}

export async function closeReview(actor: Principal, id: string): Promise<CodeReview> {
  const review = await getReview(actor, id);
  assertManagedHere(review, 'Close');
  if (review.author.id !== actor.id && actor.role !== 'ADMIN') {
    throw forbidden('Only the author or a team lead can close a review.');
  }
  await db().query(`UPDATE code_reviews SET status = 'CLOSED' WHERE id = $1`, [id]);
  await recordActivity({
    actorId: actor.id, action: 'review.closed', entityType: 'review', entityId: id,
    entityLabel: review.title, projectId: review.projectId,
  });
  return getReview(actor, id);
}

export async function listComments(actor: Principal, reviewId: string): Promise<ReviewComment[]> {
  await getReview(actor, reviewId);
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT rc.id, rc.body, rc.file_path, rc.line, rc.parent_id, rc.resolved,
            rc.created_at, rc.updated_at, ${userJoinColumns('u', 'author')}
       FROM review_comments rc LEFT JOIN users u ON u.id = rc.author_id
      WHERE rc.review_id = $1 AND rc.deleted_at IS NULL
      ORDER BY rc.file_path NULLS FIRST, rc.line NULLS FIRST, rc.created_at ASC`,
    [reviewId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    body: row.body as string,
    author: nestedUser(row, 'author')!,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string | null),
    editedBy: null,
    filePath: (row.file_path as string | null) ?? null,
    line: (row.line as number | null) ?? null,
    parentId: (row.parent_id as string | null) ?? null,
    resolved: Boolean(row.resolved),
  }));
}

export async function addComment(
  actor: Principal,
  reviewId: string,
  input: { body: string; filePath?: string; line?: number; parentId?: string | null; mentions: string[] },
): Promise<ReviewComment> {
  const review = await getReview(actor, reviewId);

  if (input.parentId) {
    const { rows } = await db().query<{ review_id: string }>(
      `SELECT review_id FROM review_comments WHERE id = $1`,
      [input.parentId],
    );
    // A reply must stay within the review it belongs to.
    if (rows[0]?.review_id !== reviewId) throw badRequest('That comment is not part of this review.');
  }

  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO review_comments (review_id, author_id, body, file_path, line, parent_id, mentions)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [reviewId, actor.id, input.body, input.filePath ?? null, input.line ?? null, input.parentId ?? null, input.mentions],
  );
  const id = rows[0]!.id;

  const watchers = [review.author.id, ...review.reviewers.map((r) => r.user.id)].filter(
    (uid) => !input.mentions.includes(uid),
  );
  await notify({
    userIds: watchers, kind: 'TASK_COMMENT',
    title: `New comment on ${review.reference}`, body: input.body.slice(0, 140),
    link: `/code-review/${reviewId}`, actorId: actor.id,
  });
  await notify({
    userIds: input.mentions, kind: 'MENTION',
    title: `${actor.name} mentioned you on ${review.reference}`,
    body: input.body.slice(0, 140), link: `/code-review/${reviewId}`, actorId: actor.id,
  });

  return (await listComments(actor, reviewId)).find((c) => c.id === id)!;
}

export async function resolveComment(actor: Principal, reviewId: string, commentId: string, resolved: boolean): Promise<ReviewComment[]> {
  await getReview(actor, reviewId);
  await db().query(
    `UPDATE review_comments SET resolved = $3 WHERE id = $1 AND review_id = $2`,
    [commentId, reviewId, resolved],
  );
  return listComments(actor, reviewId);
}
