import type { Comment, Issue, Paginated } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { paginate } from '../../lib/http.js';
import { recordActivity } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import { realtime } from '../../realtime/socket.js';
import type { Principal } from '../../middleware/authenticate.js';
import {
  applyProjectScope, assertOwnershipWrite, assertProjectAccess, safeOrder, safeSort, WhereBuilder,
} from '../common/access.js';

const ISSUE_SELECT = `
  SELECT i.id, i.project_id, i.number, i.title, i.description, i.kind, i.severity, i.status,
         i.steps_to_reproduce, i.expected_behaviour, i.actual_behaviour, i.environment,
         i.affected_version, i.labels, i.linked_task_id, i.resolution,
         i.created_at, i.updated_at, i.resolved_at,
         p.key AS project_key, p.name AS project_name, p.color AS project_color,
         ${userJoinColumns('a', 'assignee')},
         ${userJoinColumns('r', 'reporter')},
         (SELECT count(*)::int FROM issue_comments ic WHERE ic.issue_id = i.id AND ic.deleted_at IS NULL) AS comment_count
    FROM issues i
    JOIN projects p ON p.id = i.project_id
    LEFT JOIN users a ON a.id = i.assignee_id
    LEFT JOIN users r ON r.id = i.reporter_id
`;

function mapIssue(row: Record<string, unknown>): Issue {
  return {
    id: row.id as string,
    reference: `${row.project_key as string}-B${row.number as number}`,
    projectId: row.project_id as string,
    project: {
      id: row.project_id as string,
      name: row.project_name as string,
      key: row.project_key as string,
      color: row.project_color as string,
    },
    title: row.title as string,
    description: row.description as string,
    kind: row.kind as Issue['kind'],
    severity: row.severity as Issue['severity'],
    status: row.status as Issue['status'],
    assignee: nestedUser(row, 'assignee'),
    reporter: nestedUser(row, 'reporter') ?? {
      id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER', status: 'DEACTIVATED',
      avatarUrl: null, avatarColor: '#94a3b8', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    stepsToReproduce: (row.steps_to_reproduce as string | null) ?? null,
    expectedBehaviour: (row.expected_behaviour as string | null) ?? null,
    actualBehaviour: (row.actual_behaviour as string | null) ?? null,
    environment: (row.environment as string | null) ?? null,
    affectedVersion: (row.affected_version as string | null) ?? null,
    labels: (row.labels as string[]) ?? [],
    linkedTaskId: (row.linked_task_id as string | null) ?? null,
    resolution: (row.resolution as string | null) ?? null,
    commentCount: (row.comment_count as number) ?? 0,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
    resolvedAt: iso(row.resolved_at as string | null),
  };
}

const SORT_COLUMNS = {
  updatedAt: 'i.updated_at',
  createdAt: 'i.created_at',
  // S1 is the most severe, so order by weight rather than the label.
  severity: `CASE i.severity WHEN 'S1' THEN 4 WHEN 'S2' THEN 3 WHEN 'S3' THEN 2 ELSE 1 END`,
  status: 'i.status',
} as const;

export async function listIssues(
  actor: Principal,
  f: {
    page: number; pageSize: number; projectId?: string; assigneeId?: string; reporterId?: string;
    status?: string[]; severity?: string[]; kind?: string[]; q?: string; sort?: string; order?: string;
  },
): Promise<Paginated<Issue>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'i.project_id');
  where.addIf(f.projectId, `i.project_id = ?`, f.projectId);
  where.addIf(f.status, `i.status = ANY(?::text[])`, f.status);
  where.addIf(f.severity, `i.severity = ANY(?::text[])`, f.severity);
  where.addIf(f.kind, `i.kind = ANY(?::text[])`, f.kind);

  if (f.assigneeId === 'me') where.add(`i.assignee_id = ?`, actor.id);
  else if (f.assigneeId === 'unassigned') where.raw(`i.assignee_id IS NULL`);
  else if (f.assigneeId) where.add(`i.assignee_id = ?`, f.assigneeId);

  if (f.reporterId === 'me') where.add(`i.reporter_id = ?`, actor.id);
  else if (f.reporterId) where.add(`i.reporter_id = ?`, f.reporterId);

  if (f.q) {
    where.add(
      `(to_tsvector('english', i.title || ' ' || i.description) @@ plainto_tsquery('english', ?)
        OR i.title ILIKE ? OR (p.key || '-B' || i.number) ILIKE ?)`,
      f.q, `%${f.q}%`, `%${f.q}%`,
    );
  }

  const sort = safeSort(f.sort, SORT_COLUMNS, 'updatedAt');
  const order = safeOrder(f.order);
  const offset = (f.page - 1) * f.pageSize;

  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${ISSUE_SELECT} ${where.sql} ORDER BY ${sort} ${order} NULLS LAST, i.id LIMIT ${f.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM issues i JOIN projects p ON p.id = i.project_id ${where.sql}`,
      where.params,
    ),
  ]);

  return paginate(rows.map(mapIssue), counts[0]?.n ?? 0, f.page, f.pageSize);
}

export async function getIssue(actor: Principal, id: string): Promise<Issue> {
  const { rows } = await db().query<Record<string, unknown>>(`${ISSUE_SELECT} WHERE i.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Issue');
  await assertProjectAccess(actor, row.project_id as string);
  return mapIssue(row);
}

export async function createIssue(actor: Principal, input: Record<string, unknown>): Promise<Issue> {
  const projectId = input.projectId as string;
  await assertProjectAccess(actor, projectId);

  const id = await db().transaction(async (tx) => {
    // Shares the project counter with tasks, so a reference is unique across
    // both and `XSP-B12` can never collide with `XSP-12`.
    const { rows: counter } = await tx.query<{ task_counter: number }>(
      `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
      [projectId],
    );
    const number = counter[0]?.task_counter;
    if (!number) throw notFound('Project');

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO issues (project_id, number, title, description, kind, severity, status,
                           assignee_id, reporter_id, steps_to_reproduce, expected_behaviour,
                           actual_behaviour, environment, affected_version, labels, linked_task_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [
        projectId, number, input.title, input.description, input.kind ?? 'BUG',
        input.severity ?? 'S3', input.status ?? 'OPEN', input.assigneeId ?? null, actor.id,
        input.stepsToReproduce ?? null, input.expectedBehaviour ?? null, input.actualBehaviour ?? null,
        input.environment ?? null, input.affectedVersion ?? null, (input.labels as string[]) ?? [],
        input.linkedTaskId ?? null,
      ],
    );
    const issueId = rows[0]!.id;
    await recordActivity(
      { actorId: actor.id, action: 'issue.created', entityType: 'issue', entityId: issueId, entityLabel: input.title as string, projectId, metadata: { severity: input.severity } },
      tx,
    );
    return issueId;
  });

  const issue = await getIssue(actor, id);
  realtime.toProject(projectId, 'issue:created', { issue });

  if (issue.assignee) {
    await notify({
      userIds: [issue.assignee.id], kind: 'ISSUE_ASSIGNED',
      title: `${issue.reference} assigned to you`, body: issue.title,
      link: `/issues/${id}`, actorId: actor.id,
    });
  }
  // A critical issue is told to the whole project, not just the assignee.
  if (issue.severity === 'S1') {
    const { rows: members } = await db().query<{ user_id: string }>(
      `SELECT user_id FROM project_members WHERE project_id = $1`,
      [projectId],
    );
    await notify({
      userIds: members.map((m) => m.user_id), kind: 'SYSTEM',
      title: `Critical issue raised: ${issue.reference}`, body: issue.title,
      link: `/issues/${id}`, actorId: actor.id,
    });
  }
  return issue;
}

export async function updateIssue(actor: Principal, id: string, input: Record<string, unknown>): Promise<Issue> {
  const existing = await getIssue(actor, id);
  assertOwnershipWrite(actor, 'issue:update', 'issue:update_own', [
    existing.assignee?.id, existing.reporter.id,
  ]);

  const columns: Record<string, string> = {
    title: 'title', description: 'description', kind: 'kind', severity: 'severity', status: 'status',
    assigneeId: 'assignee_id', stepsToReproduce: 'steps_to_reproduce',
    expectedBehaviour: 'expected_behaviour', actualBehaviour: 'actual_behaviour',
    environment: 'environment', affectedVersion: 'affected_version', labels: 'labels',
    linkedTaskId: 'linked_task_id',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return existing;

  await db().query(`UPDATE issues SET ${sets.join(', ')} WHERE id = $1`, params);
  await recordActivity({
    actorId: actor.id, action: 'issue.updated', entityType: 'issue', entityId: id,
    entityLabel: existing.title, projectId: existing.projectId, metadata: { fields: Object.keys(input) },
  });

  const issue = await getIssue(actor, id);
  realtime.toProject(issue.projectId, 'issue:updated', { issue });

  if (input.assigneeId && input.assigneeId !== existing.assignee?.id) {
    await notify({
      userIds: [input.assigneeId as string], kind: 'ISSUE_ASSIGNED',
      title: `${issue.reference} assigned to you`, body: issue.title,
      link: `/issues/${id}`, actorId: actor.id,
    });
  }
  return issue;
}

export async function resolveIssue(
  actor: Principal,
  id: string,
  input: { resolution: string; status: 'RESOLVED' | 'CLOSED' | 'WONT_FIX' },
): Promise<Issue> {
  const existing = await getIssue(actor, id);
  assertOwnershipWrite(actor, 'issue:close', 'issue:close', [existing.assignee?.id, existing.reporter.id]);

  await db().query(
    `UPDATE issues SET status = $2, resolution = $3 WHERE id = $1`,
    [id, input.status, input.resolution],
  );
  await recordActivity({
    actorId: actor.id, action: 'issue.resolved', entityType: 'issue', entityId: id,
    entityLabel: existing.title, projectId: existing.projectId, metadata: { status: input.status },
  });

  const issue = await getIssue(actor, id);
  realtime.toProject(issue.projectId, 'issue:updated', { issue });
  await notify({
    userIds: [existing.reporter.id], kind: 'SYSTEM',
    title: `${issue.reference} was ${input.status.toLowerCase().replace('_', ' ')}`,
    body: input.resolution.slice(0, 140), link: `/issues/${id}`, actorId: actor.id,
  });
  return issue;
}

export async function deleteIssue(actor: Principal, id: string): Promise<void> {
  const existing = await getIssue(actor, id);
  await db().transaction(async (tx) => {
    await tx.query(`DELETE FROM issues WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'issue.deleted', entityType: 'issue', entityId: id, entityLabel: existing.title, projectId: existing.projectId },
      tx,
    );
  });
}

export async function listComments(actor: Principal, issueId: string): Promise<Comment[]> {
  await getIssue(actor, issueId);
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT ic.id, ic.body, ic.created_at, ic.updated_at, ${userJoinColumns('u', 'author')}
       FROM issue_comments ic LEFT JOIN users u ON u.id = ic.author_id
      WHERE ic.issue_id = $1 AND ic.deleted_at IS NULL ORDER BY ic.created_at ASC`,
    [issueId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    body: row.body as string,
    author: nestedUser(row, 'author')!,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string | null),
    editedBy: null,
  }));
}

export async function addComment(
  actor: Principal,
  issueId: string,
  input: { body: string; mentions: string[] },
): Promise<Comment> {
  const issue = await getIssue(actor, issueId);
  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO issue_comments (issue_id, author_id, body, mentions) VALUES ($1,$2,$3,$4) RETURNING id`,
    [issueId, actor.id, input.body, input.mentions],
  );
  const id = rows[0]!.id;

  const watchers = [issue.assignee?.id, issue.reporter.id].filter(
    (uid): uid is string => Boolean(uid) && !input.mentions.includes(uid!),
  );
  await notify({
    userIds: watchers, kind: 'TASK_COMMENT',
    title: `New comment on ${issue.reference}`, body: input.body.slice(0, 140),
    link: `/issues/${issueId}`, actorId: actor.id,
  });
  await notify({
    userIds: input.mentions, kind: 'MENTION',
    title: `${actor.name} mentioned you on ${issue.reference}`,
    body: input.body.slice(0, 140), link: `/issues/${issueId}`, actorId: actor.id,
  });

  return (await listComments(actor, issueId)).find((c) => c.id === id)!;
}
