import {
  can, canTransition, type Comment, type Paginated, type Task, type TaskStatus,
} from '@xenospace/shared';
import { db, type Queryable } from '../../db/index.js';
import { badRequest, conflict, forbidden, illegalTransition, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { paginate } from '../../lib/http.js';
import { recordActivity } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import { realtime } from '../../realtime/socket.js';
import type { Principal } from '../../middleware/authenticate.js';
import {
  applyProjectScope, assertOwnershipWrite, assertProjectAccess, safeOrder, safeSort, WhereBuilder,
} from '../common/access.js';

const TASK_SELECT = `
  SELECT t.id, t.project_id, t.number, t.title, t.description, t.type, t.status, t.priority,
         t.sprint_id, t.parent_task_id, t.estimate, t.position, t.due_date, t.labels,
         t.created_at, t.updated_at, t.completed_at,
         p.key AS project_key, p.name AS project_name, p.color AS project_color,
         ${userJoinColumns('a', 'assignee')},
         ${userJoinColumns('r', 'reporter')},
         (SELECT count(*)::int FROM task_comments tc WHERE tc.task_id = t.id AND tc.deleted_at IS NULL) AS comment_count,
         (SELECT count(*)::int FROM task_attachments ta WHERE ta.task_id = t.id) AS attachment_count,
         (SELECT count(*)::int FROM tasks st WHERE st.parent_task_id = t.id) AS subtask_count,
         (SELECT count(*)::int FROM tasks st WHERE st.parent_task_id = t.id AND st.status = 'DONE') AS done_subtask_count,
         (SELECT coalesce(sum(tl.minutes), 0)::int FROM time_logs tl WHERE tl.task_id = t.id) AS logged_minutes
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users r ON r.id = t.reporter_id
`;

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    reference: `${row.project_key as string}-${row.number as number}`,
    projectId: row.project_id as string,
    project: {
      id: row.project_id as string,
      name: row.project_name as string,
      key: row.project_key as string,
      color: row.project_color as string,
    },
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    type: row.type as Task['type'],
    status: row.status as TaskStatus,
    priority: row.priority as Task['priority'],
    assignee: nestedUser(row, 'assignee'),
    reporter: nestedUser(row, 'reporter') ?? {
      // A reporter whose account was deleted leaves a null FK; the UI still
      // needs a renderable value rather than a crash.
      id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER', status: 'DEACTIVATED',
      avatarUrl: null, avatarColor: '#94a3b8', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    sprintId: (row.sprint_id as string | null) ?? null,
    parentTaskId: (row.parent_task_id as string | null) ?? null,
    estimate: (row.estimate as number | null) ?? null,
    position: Number(row.position ?? 0),
    dueDate: (row.due_date as string | null) ?? null,
    labels: (row.labels as string[]) ?? [],
    commentCount: (row.comment_count as number) ?? 0,
    attachmentCount: (row.attachment_count as number) ?? 0,
    subtaskCount: (row.subtask_count as number) ?? 0,
    doneSubtaskCount: (row.done_subtask_count as number) ?? 0,
    blockedBy: (row.blocked_by as Task['blockedBy']) ?? [],
    loggedMinutes: (row.logged_minutes as number) ?? 0,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
    completedAt: iso(row.completed_at as string | null),
  };
}

const SORT_COLUMNS = {
  position: 't.position',
  updatedAt: 't.updated_at',
  createdAt: 't.created_at',
  // Ordered by urgency, not alphabetically, which CASE makes explicit.
  priority: `CASE t.priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END`,
  dueDate: 't.due_date',
} as const;

export interface TaskListFilters {
  page: number; pageSize: number;
  projectId?: string; sprintId?: string; assigneeId?: string;
  status?: string[]; priority?: string[]; type?: string[];
  label?: string; q?: string; dueBefore?: string; dueAfter?: string; overdue?: boolean; unscheduled?: boolean;
  sort?: string; order?: string;
}

export async function listTasks(actor: Principal, f: TaskListFilters): Promise<Paginated<Task>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 't.project_id');
  where.addIf(f.projectId, `t.project_id = ?`, f.projectId);
  where.addIf(f.sprintId, `t.sprint_id = ?`, f.sprintId);
  where.addIf(f.status, `t.status = ANY(?::text[])`, f.status);
  where.addIf(f.priority, `t.priority = ANY(?::text[])`, f.priority);
  where.addIf(f.type, `t.type = ANY(?::text[])`, f.type);
  where.addIf(f.label, `? = ANY(t.labels)`, f.label);
  where.addIf(f.dueBefore, `t.due_date <= ?`, f.dueBefore);
  where.addIf(f.dueAfter, `t.due_date >= ?`, f.dueAfter);
  if (f.unscheduled) where.raw(`t.due_date IS NULL`);

  // `me` and `unassigned` are resolved server-side, so the client never needs
  // to know its own id to ask for its own work.
  if (f.assigneeId === 'me') where.add(`t.assignee_id = ?`, actor.id);
  else if (f.assigneeId === 'unassigned') where.raw(`t.assignee_id IS NULL`);
  else if (f.assigneeId) where.add(`t.assignee_id = ?`, f.assigneeId);

  if (f.overdue) where.raw(`t.due_date < current_date AND t.status <> 'DONE'`);

  if (f.q) {
    // Full-text where the query looks like prose, ILIKE for a reference or
    // fragment, so searching "XSP-12" still works.
    where.add(
      `(to_tsvector('english', t.title || ' ' || coalesce(t.description, '')) @@ plainto_tsquery('english', ?)
        OR t.title ILIKE ? OR (p.key || '-' || t.number) ILIKE ?)`,
      f.q, `%${f.q}%`, `%${f.q}%`,
    );
  }

  const sort = safeSort(f.sort, SORT_COLUMNS, 'updatedAt');
  const order = safeOrder(f.order);
  const offset = (f.page - 1) * f.pageSize;

  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${TASK_SELECT} ${where.sql} ORDER BY ${sort} ${order} NULLS LAST, t.id LIMIT ${f.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tasks t JOIN projects p ON p.id = t.project_id ${where.sql}`,
      where.params,
    ),
  ]);

  const tasks = rows.map(mapTask);
  await attachBlockers(tasks);
  return paginate(tasks, counts[0]?.n ?? 0, f.page, f.pageSize);
}

/** Loads blocker summaries for a page of tasks in one query, avoiding N+1. */
async function attachBlockers(tasks: Task[]): Promise<void> {
  if (tasks.length === 0) return;
  const { rows } = await db().query<{
    task_id: string; id: string; title: string; status: TaskStatus; number: number; project_key: string;
  }>(
    `SELECT tb.task_id, b.id, b.title, b.status, b.number, p.key AS project_key
       FROM task_blockers tb
       JOIN tasks b ON b.id = tb.blocked_by_id
       JOIN projects p ON p.id = b.project_id
      WHERE tb.task_id = ANY($1::uuid[])`,
    [tasks.map((t) => t.id)],
  );
  const byTask = new Map<string, Task['blockedBy']>();
  for (const row of rows) {
    const list = byTask.get(row.task_id) ?? [];
    list.push({ id: row.id, reference: `${row.project_key}-${row.number}`, title: row.title, status: row.status });
    byTask.set(row.task_id, list);
  }
  for (const task of tasks) task.blockedBy = byTask.get(task.id) ?? [];
}

/** Kanban board grouped by status, ordered by rank within each column. */
export async function getBoard(
  actor: Principal,
  opts: { projectId?: string; sprintId?: string; assigneeId?: string },
): Promise<Record<TaskStatus, Task[]>> {
  if (opts.projectId) await assertProjectAccess(actor, opts.projectId);

  const where = new WhereBuilder();
  applyProjectScope(where, actor, 't.project_id');
  where.addIf(opts.projectId, `t.project_id = ?`, opts.projectId);
  where.addIf(opts.sprintId, `t.sprint_id = ?`, opts.sprintId);
  if (opts.assigneeId === 'me') where.add(`t.assignee_id = ?`, actor.id);
  else if (opts.assigneeId) where.add(`t.assignee_id = ?`, opts.assigneeId);

  const { rows } = await db().query<Record<string, unknown>>(
    `${TASK_SELECT} ${where.sql} ORDER BY t.position ASC, t.created_at ASC LIMIT 1000`,
    where.params,
  );
  const tasks = rows.map(mapTask);
  await attachBlockers(tasks);

  const board: Record<string, Task[]> = {
    BACKLOG: [], TODO: [], IN_PROGRESS: [], IN_REVIEW: [], BLOCKED: [], DONE: [],
  };
  for (const task of tasks) board[task.status]?.push(task);
  return board as Record<TaskStatus, Task[]>;
}

export async function getTask(actor: Principal, id: string): Promise<Task> {
  const { rows } = await db().query<Record<string, unknown>>(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Task');
  await assertProjectAccess(actor, row.project_id as string);
  const task = mapTask(row);
  await attachBlockers([task]);
  return task;
}

/**
 * Allocates the next per-project task number.
 *
 * The counter is incremented and read in one statement, so two concurrent
 * creates cannot both read the same value — which a SELECT-then-UPDATE would
 * allow, producing duplicate references.
 */
async function nextTaskNumber(tx: Queryable, projectId: string): Promise<number> {
  const { rows } = await tx.query<{ task_counter: number }>(
    `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
    [projectId],
  );
  const n = rows[0]?.task_counter;
  if (!n) throw notFound('Project');
  return n;
}

/** Rank placing a new card at the top of its column. */
async function topPosition(tx: Queryable, projectId: string, status: TaskStatus): Promise<number> {
  const { rows } = await tx.query<{ min: number | null }>(
    `SELECT min(position) AS min FROM tasks WHERE project_id = $1 AND status = $2`,
    [projectId, status],
  );
  const min = rows[0]?.min;
  return min === null || min === undefined ? 1000 : Number(min) - 100;
}

/**
 * Replaces a task's blockers. Every blocker must be a task in the same project:
 * the blocker's title and status are returned with the task, so accepting an id
 * from another project would leak that project's work to anyone who has an id.
 */
async function setBlockers(tx: Queryable, taskId: string, projectId: string, ids: string[]): Promise<void> {
  const wanted = [...new Set(ids)].filter((id) => id !== taskId).slice(0, 20);
  if (wanted.length > 0) {
    const { rows } = await tx.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM tasks WHERE id = ANY($1::uuid[]) AND project_id = $2`,
      [wanted, projectId],
    );
    if (Number(rows[0]?.count) !== wanted.length) {
      throw badRequest('A blocking task must be in the same project.');
    }
  }
  await tx.query(`DELETE FROM task_blockers WHERE task_id = $1`, [taskId]);
  for (const blockerId of wanted) {
    await tx.query(
      `INSERT INTO task_blockers (task_id, blocked_by_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [taskId, blockerId],
    );
  }
}

/** A parent must exist and live in the same project as its subtask. */
async function assertParentInProject(tx: Queryable, parentTaskId: string, projectId: string): Promise<void> {
  const { rows: parent } = await tx.query<{ project_id: string }>(
    `SELECT project_id FROM tasks WHERE id = $1`,
    [parentTaskId],
  );
  // Same message for "missing" and "elsewhere", so ids cannot be probed.
  if (parent[0]?.project_id !== projectId) {
    throw badRequest('A subtask must live in the same project as its parent.');
  }
}

export async function createTask(actor: Principal, input: Record<string, unknown>): Promise<Task> {
  const projectId = input.projectId as string;
  await assertProjectAccess(actor, projectId);

  // Creating a task already assigned to someone else is the same act as
  // reassigning one, so it needs the same permission. Self-assignment is fine.
  if (input.assigneeId && input.assigneeId !== actor.id && !can(actor.role, 'task:assign')) {
    throw forbidden('Only a team lead can assign work to someone else.');
  }

  const taskId = await db().transaction(async (tx) => {
    const number = await nextTaskNumber(tx, projectId);
    const status = (input.status as TaskStatus) ?? 'TODO';
    const position = await topPosition(tx, projectId, status);

    // A subtask must belong to the same project as its parent, or the board
    // would show work from a project the viewer may not be able to see.
    if (input.parentTaskId) await assertParentInProject(tx, input.parentTaskId as string, projectId);

    // An assignee must actually be on the project.
    if (input.assigneeId) {
      const { rows: member } = await tx.query<{ ok: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2) AS ok`,
        [projectId, input.assigneeId as string],
      );
      if (!member[0]?.ok) throw badRequest('That person is not a member of this project.');
    }

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO tasks (project_id, number, title, description, type, status, priority,
                          assignee_id, reporter_id, sprint_id, parent_task_id, estimate, position, due_date, labels)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [
        projectId, number, input.title, input.description ?? null, input.type ?? 'FEATURE',
        status, input.priority ?? 'MEDIUM', input.assigneeId ?? null, actor.id,
        input.sprintId ?? null, input.parentTaskId ?? null, input.estimate ?? null,
        position, input.dueDate ?? null, (input.labels as string[]) ?? [],
      ],
    );
    const id = rows[0]!.id;

    if (input.blockedByIds) await setBlockers(tx, id, projectId, input.blockedByIds as string[]);

    await recordActivity(
      { actorId: actor.id, action: 'task.created', entityType: 'task', entityId: id, entityLabel: input.title as string, projectId },
      tx,
    );
    return id;
  });

  const task = await getTask(actor, taskId);

  realtime.toProject(projectId, 'task:created', { task });
  if (task.assignee && task.assignee.id !== actor.id) {
    await notify({
      userIds: [task.assignee.id],
      kind: 'TASK_ASSIGNED',
      title: `${task.reference} assigned to you`,
      body: task.title,
      link: `/tasks/${task.id}`,
      actorId: actor.id,
      metadata: { taskId: task.id, projectId },
    });
  }
  return task;
}

interface TaskWriteRow {
  project_id: string;
  assignee_id: string | null;
  reporter_id: string | null;
  status: TaskStatus;
  title: string;
}

/** Loads a task for writing and asserts the actor may modify it. */
async function loadForWrite(actor: Principal, id: string, tx?: Queryable): Promise<TaskWriteRow> {
  const runner = tx ?? db();
  const { rows } = await runner.query<TaskWriteRow>(
    `SELECT project_id, assignee_id, reporter_id, status, title FROM tasks WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('Task');
  await assertProjectAccess(actor, row.project_id, tx);
  // A developer may edit a task they own — assigned to them or raised by them.
  assertOwnershipWrite(actor, 'task:update', 'task:update_own', [row.assignee_id, row.reporter_id]);
  return row;
}

export async function updateTask(actor: Principal, id: string, input: Record<string, unknown>): Promise<Task> {
  const existing = await loadForWrite(actor, id);

  const columns: Record<string, string> = {
    title: 'title', description: 'description', type: 'type', priority: 'priority',
    assigneeId: 'assignee_id', sprintId: 'sprint_id', estimate: 'estimate',
    dueDate: 'due_date', labels: 'labels', status: 'status', parentTaskId: 'parent_task_id',
  };

  // Reassignment is a privileged act: a developer can edit their own task but
  // must not be able to hand it to someone else.
  if (input.assigneeId !== undefined && input.assigneeId !== existing.assignee_id) {
    if (!can(actor.role, 'task:assign')) throw forbidden('Only a team lead can reassign a task.');
  }

  if (input.status !== undefined && input.status !== existing.status) {
    if (!canTransition(existing.status, input.status as TaskStatus)) {
      throw illegalTransition(existing.status, input.status as string);
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  // blockedByIds is not a column, so an edit of only the blockers has no SET.
  if (sets.length === 0 && input.blockedByIds === undefined) return getTask(actor, id);

  await db().transaction(async (tx) => {
    if (input.parentTaskId) {
      if (input.parentTaskId === id) throw badRequest('A task cannot be its own parent.');
      await assertParentInProject(tx, input.parentTaskId as string, existing.project_id);
    }

    if (sets.length > 0) await tx.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, params);

    if (input.blockedByIds !== undefined) {
      await setBlockers(tx, id, existing.project_id, (input.blockedByIds as string[]) ?? []);
    }

    await recordActivity(
      {
        actorId: actor.id, action: 'task.updated', entityType: 'task', entityId: id,
        entityLabel: (input.title as string) ?? existing.title, projectId: existing.project_id,
        metadata: { fields: Object.keys(input) },
      },
      tx,
    );
  });

  const task = await getTask(actor, id);
  realtime.toProject(existing.project_id, 'task:updated', { task, changedFields: Object.keys(input) });

  if (input.assigneeId && input.assigneeId !== existing.assignee_id) {
    await notify({
      userIds: [input.assigneeId as string],
      kind: 'TASK_ASSIGNED',
      title: `${task.reference} assigned to you`,
      body: task.title,
      link: `/tasks/${task.id}`,
      actorId: actor.id,
    });
  }
  return task;
}

/**
 * Moves a card on the board.
 *
 * The transition is re-validated server-side even though the UI only offers
 * legal drops — a crafted request must not be able to skip review and mark work
 * done. `position` is the fractional rank the client computed from the
 * neighbours it was dropped between, so a reorder writes one row.
 */
export async function moveTask(
  actor: Principal,
  id: string,
  input: { status: TaskStatus; position: number; sprintId?: string | null },
): Promise<Task> {
  const existing = await loadForWrite(actor, id);
  const { can } = await import('@xenospace/shared');
  if (!can(actor.role, 'task:transition')) throw forbidden();

  if (!canTransition(existing.status, input.status)) {
    throw illegalTransition(existing.status, input.status);
  }

  // Leaving BLOCKED requires the blockers to be done, or "blocked" means nothing.
  if (existing.status === 'BLOCKED' && input.status !== 'BLOCKED') {
    const { rows } = await db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM task_blockers tb
         JOIN tasks b ON b.id = tb.blocked_by_id
        WHERE tb.task_id = $1 AND b.status <> 'DONE'`,
      [id],
    );
    if ((rows[0]?.n ?? 0) > 0) {
      throw conflict('Finish the blocking tasks before moving this one.');
    }
  }

  await db().transaction(async (tx) => {
    await tx.query(
      `UPDATE tasks SET status = $2, position = $3,
                        sprint_id = CASE WHEN $4 THEN $5 ELSE sprint_id END
        WHERE id = $1`,
      [id, input.status, input.position, input.sprintId !== undefined, input.sprintId ?? null],
    );
    await recordActivity(
      {
        actorId: actor.id, action: 'task.moved', entityType: 'task', entityId: id,
        entityLabel: existing.title, projectId: existing.project_id,
        metadata: { from: existing.status, to: input.status },
      },
      tx,
    );
  });

  const task = await getTask(actor, id);
  realtime.toProject(existing.project_id, 'task:moved', {
    taskId: id,
    projectId: existing.project_id,
    from: existing.status,
    to: input.status,
    position: input.position,
    actorId: actor.id,
  });
  realtime.toProject(existing.project_id, 'task:updated', { task, changedFields: ['status', 'position'] });

  // Tell the reporter their work is ready to look at.
  if (input.status === 'IN_REVIEW' && existing.reporter_id && existing.reporter_id !== actor.id) {
    await notify({
      userIds: [existing.reporter_id],
      kind: 'TASK_UPDATED',
      title: `${task.reference} is ready for review`,
      body: task.title,
      link: `/tasks/${id}`,
      actorId: actor.id,
    });
  }
  return task;
}

export async function assignTask(actor: Principal, id: string, assigneeId: string | null): Promise<Task> {
  const existing = await loadForWrite(actor, id);

  if (assigneeId) {
    const { rows } = await db().query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2) AS ok`,
      [existing.project_id, assigneeId],
    );
    if (!rows[0]?.ok) throw badRequest('That person is not a member of this project.');
  }

  await db().transaction(async (tx) => {
    await tx.query(`UPDATE tasks SET assignee_id = $2 WHERE id = $1`, [id, assigneeId]);
    await recordActivity(
      {
        actorId: actor.id, action: assigneeId ? 'task.assigned' : 'task.unassigned',
        entityType: 'task', entityId: id, entityLabel: existing.title,
        projectId: existing.project_id, metadata: { assigneeId },
      },
      tx,
    );
  });

  const task = await getTask(actor, id);
  realtime.toProject(existing.project_id, 'task:updated', { task, changedFields: ['assignee'] });
  if (assigneeId && assigneeId !== actor.id) {
    await notify({
      userIds: [assigneeId], kind: 'TASK_ASSIGNED',
      title: `${task.reference} assigned to you`, body: task.title,
      link: `/tasks/${id}`, actorId: actor.id,
    });
  }
  return task;
}

export async function deleteTask(actor: Principal, id: string): Promise<void> {
  const { rows } = await db().query<{ project_id: string; title: string }>(
    `SELECT project_id, title FROM tasks WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('Task');
  await assertProjectAccess(actor, row.project_id);

  await db().transaction(async (tx) => {
    await tx.query(`DELETE FROM tasks WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'task.deleted', entityType: 'task', entityId: id, entityLabel: row.title, projectId: row.project_id },
      tx,
    );
  });
  realtime.toProject(row.project_id, 'task:deleted', { taskId: id, projectId: row.project_id });
}

/* ------------------------------------------------------------------ comments */

export async function listComments(actor: Principal, taskId: string): Promise<Comment[]> {
  await getTask(actor, taskId);
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT tc.id, tc.body, tc.created_at, tc.updated_at, ${userJoinColumns('u', 'author')}
       FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_id
      WHERE tc.task_id = $1 AND tc.deleted_at IS NULL
      ORDER BY tc.created_at ASC`,
    [taskId],
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
  taskId: string,
  input: { body: string; mentions: string[] },
): Promise<Comment> {
  const task = await getTask(actor, taskId);

  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO task_comments (task_id, author_id, body, mentions)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [taskId, actor.id, input.body, input.mentions],
  );
  const id = rows[0]!.id;

  await recordActivity({
    actorId: actor.id, action: 'task.commented', entityType: 'task', entityId: taskId,
    entityLabel: task.title, projectId: task.projectId,
  });

  // The assignee and reporter are told about the comment; anyone @-mentioned
  // gets the stronger MENTION kind instead, so the two do not double up.
  const watchers = [task.assignee?.id, task.reporter.id].filter(
    (uid): uid is string => Boolean(uid) && !input.mentions.includes(uid!),
  );
  await notify({
    userIds: watchers, kind: 'TASK_COMMENT',
    title: `New comment on ${task.reference}`,
    body: input.body.slice(0, 140), link: `/tasks/${taskId}`, actorId: actor.id,
  });
  await notify({
    userIds: input.mentions, kind: 'MENTION',
    title: `${actor.name} mentioned you on ${task.reference}`,
    body: input.body.slice(0, 140), link: `/tasks/${taskId}`, actorId: actor.id,
  });

  const comments = await listComments(actor, taskId);
  return comments.find((c) => c.id === id)!;
}

/* ---------------------------------------------------------------- time logs */

export async function logTime(
  actor: Principal,
  taskId: string,
  input: { minutes: number; spentOn: string; note?: string },
): Promise<{ loggedMinutes: number }> {
  const task = await getTask(actor, taskId);
  await db().query(
    `INSERT INTO time_logs (task_id, user_id, minutes, spent_on, note) VALUES ($1,$2,$3,$4,$5)`,
    [taskId, actor.id, input.minutes, input.spentOn, input.note ?? null],
  );
  await recordActivity({
    actorId: actor.id, action: 'task.time_logged', entityType: 'task', entityId: taskId,
    entityLabel: task.title, projectId: task.projectId, metadata: { minutes: input.minutes },
  });
  const { rows } = await db().query<{ total: number }>(
    `SELECT coalesce(sum(minutes), 0)::int AS total FROM time_logs WHERE task_id = $1`,
    [taskId],
  );
  return { loggedMinutes: rows[0]?.total ?? 0 };
}
