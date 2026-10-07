import type { Paginated, Project, ProjectMember, ProjectStats } from '@xenospace/shared';
import { db, type Queryable } from '../../db/index.js';
import { conflict, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { paginate } from '../../lib/http.js';
import { recordActivity } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import type { Principal } from '../../middleware/authenticate.js';
import { applyProjectScope, assertProjectAccess, isAdmin, safeOrder, safeSort, WhereBuilder } from '../common/access.js';

/**
 * Project queries.
 *
 * The rolled-up counters come from correlated subqueries rather than a second
 * round of requests from the UI. They are indexed lookups, and keeping them in
 * one statement is what stops the project list from becoming N+1.
 */
const PROJECT_SELECT = `
  SELECT p.id, p.name, p.key, p.description, p.status, p.color,
         p.start_date, p.target_date, p.created_at, p.updated_at,
         ${userJoinColumns('l', 'lead')},
         (SELECT count(*)::int FROM project_members pm WHERE pm.project_id = p.id) AS member_count,
         (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
         (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'DONE') AS done_tasks,
         (SELECT coalesce(sum(t.estimate), 0)::int FROM tasks t WHERE t.project_id = p.id) AS total_points,
         (SELECT coalesce(sum(t.estimate), 0)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'DONE') AS done_points,
         (SELECT count(*)::int FROM issues i WHERE i.project_id = p.id
            AND i.status NOT IN ('RESOLVED', 'CLOSED', 'WONT_FIX')) AS open_issues,
         (SELECT count(*)::int FROM code_reviews cr WHERE cr.project_id = p.id AND cr.status = 'OPEN') AS open_reviews,
         (SELECT s.id FROM sprints s WHERE s.project_id = p.id AND s.status = 'ACTIVE' LIMIT 1) AS active_sprint_id
    FROM projects p
    LEFT JOIN users l ON l.id = p.lead_id
`;

function mapProject(row: Record<string, unknown>): Project {
  const total = (row.total_tasks as number) ?? 0;
  const done = (row.done_tasks as number) ?? 0;
  const totalPoints = (row.total_points as number) ?? 0;
  const donePoints = (row.done_points as number) ?? 0;

  // Prefer story points, which reflect effort; fall back to task counts when a
  // project has not been estimated.
  const progress = totalPoints > 0
    ? Math.round((donePoints / totalPoints) * 100)
    : total > 0
      ? Math.round((done / total) * 100)
      : 0;

  const stats: ProjectStats = {
    totalTasks: total,
    doneTasks: done,
    openIssues: (row.open_issues as number) ?? 0,
    openReviews: (row.open_reviews as number) ?? 0,
    progress,
    activeSprintId: (row.active_sprint_id as string | null) ?? null,
  };

  return {
    id: row.id as string,
    name: row.name as string,
    key: row.key as string,
    description: (row.description as string | null) ?? null,
    status: row.status as Project['status'],
    color: row.color as string,
    startDate: (row.start_date as string | null) ?? null,
    targetDate: (row.target_date as string | null) ?? null,
    lead: nestedUser(row, 'lead'),
    memberCount: (row.member_count as number) ?? 0,
    stats,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
  };
}

const SORT_COLUMNS = {
  updatedAt: 'p.updated_at',
  createdAt: 'p.created_at',
  name: 'p.name',
  targetDate: 'p.target_date',
} as const;

export async function listProjects(
  actor: Principal,
  q: { page: number; pageSize: number; status?: string[]; q?: string; sort?: string; order?: string },
): Promise<Paginated<Project>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'p.id');
  where.addIf(q.status, `p.status = ANY(?::text[])`, q.status);
  where.addIf(
    q.q,
    `(p.name ILIKE ? OR p.key ILIKE ? OR coalesce(p.description, '') ILIKE ?)`,
    `%${q.q}%`, `%${q.q}%`, `%${q.q}%`,
  );
  // Archived projects are excluded unless explicitly asked for.
  if (!q.status?.includes('ARCHIVED')) where.raw(`p.archived_at IS NULL`);

  const sort = safeSort(q.sort, SORT_COLUMNS, 'updatedAt');
  const order = safeOrder(q.order);
  const offset = (q.page - 1) * q.pageSize;

  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${PROJECT_SELECT} ${where.sql}
         ORDER BY ${sort} ${order} NULLS LAST, p.id
         LIMIT ${q.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(
      `SELECT count(*)::int AS n FROM projects p ${where.sql}`,
      where.params,
    ),
  ]);

  return paginate(rows.map(mapProject), counts[0]?.n ?? 0, q.page, q.pageSize);
}

export async function getProject(actor: Principal, id: string): Promise<Project> {
  await assertProjectAccess(actor, id);
  const { rows } = await db().query<Record<string, unknown>>(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Project');
  const project = mapProject(row);
  project.members = await listMembers(id);
  return project;
}

export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT pm.project_role, pm.joined_at,
            ${userJoinColumns('u', 'u')},
            (SELECT count(*)::int FROM tasks t
              WHERE t.project_id = pm.project_id AND t.assignee_id = u.id AND t.status <> 'DONE') AS open_tasks
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1
      ORDER BY CASE pm.project_role WHEN 'LEAD' THEN 0 WHEN 'MEMBER' THEN 1 ELSE 2 END, u.name`,
    [projectId],
  );
  return rows.map((row) => ({
    user: nestedUser(row, 'u')!,
    projectRole: row.project_role as ProjectMember['projectRole'],
    joinedAt: iso(row.joined_at as string)!,
    openTasks: (row.open_tasks as number) ?? 0,
  }));
}

export async function createProject(
  actor: Principal,
  input: {
    name: string; key: string; description?: string; status: Project['status']; color: string;
    startDate?: string; targetDate?: string; leadId?: string; memberIds?: string[];
  },
): Promise<Project> {
  const projectId = await db().transaction(async (tx) => {
    const { rows: clash } = await tx.query<{ id: string }>(
      `SELECT id FROM projects WHERE upper(key) = upper($1)`,
      [input.key],
    );
    if (clash.length) throw conflict(`Project key ${input.key} is already in use.`);

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO projects (name, key, description, status, color, start_date, target_date, lead_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        input.name, input.key.toUpperCase(), input.description ?? null, input.status, input.color,
        input.startDate ?? null, input.targetDate ?? null, input.leadId ?? actor.id, actor.id,
      ],
    );
    const id = rows[0]!.id;

    // The lead is always a member, so project-scoped queries find them without
    // a special case for the lead_id column.
    const members = new Set([input.leadId ?? actor.id, ...(input.memberIds ?? [])]);
    for (const userId of members) {
      await tx.query(
        `INSERT INTO project_members (project_id, user_id, project_role)
         VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO NOTHING`,
        [id, userId, userId === (input.leadId ?? actor.id) ? 'LEAD' : 'MEMBER'],
      );
    }

    await recordActivity(
      { actorId: actor.id, action: 'project.created', entityType: 'project', entityId: id, entityLabel: input.name, projectId: id },
      tx,
    );
    return id;
  });

  const memberIds = (input.memberIds ?? []).filter((id) => id !== actor.id);
  await notify({
    userIds: memberIds,
    kind: 'SYSTEM',
    title: `Added to ${input.name}`,
    body: `${actor.name} added you to the project.`,
    link: `/projects/${projectId}`,
    actorId: actor.id,
  });

  return getProject(actor, projectId);
}

export async function updateProject(
  actor: Principal,
  id: string,
  input: Record<string, unknown>,
): Promise<Project> {
  await assertProjectAccess(actor, id);

  // Column allow-list: the set of updatable fields is fixed here, so a key the
  // schema stripped or a client invented can never reach the UPDATE.
  const columns: Record<string, string> = {
    name: 'name', description: 'description', status: 'status', color: 'color',
    startDate: 'start_date', targetDate: 'target_date', leadId: 'lead_id',
  };

  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return getProject(actor, id);

  // Archiving is driven by the status rather than a separate flag, so the two
  // cannot disagree.
  if (input.status === 'ARCHIVED') sets.push('archived_at = now()');
  else if (input.status !== undefined) sets.push('archived_at = NULL');

  await db().transaction(async (tx) => {
    const { rowCount } = await tx.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $1`, params);
    if (rowCount === 0) throw notFound('Project');

    if (input.leadId) {
      await tx.query(
        `INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, 'LEAD')
         ON CONFLICT (project_id, user_id) DO UPDATE SET project_role = 'LEAD'`,
        [id, input.leadId],
      );
    }
    await recordActivity(
      { actorId: actor.id, action: 'project.updated', entityType: 'project', entityId: id, projectId: id, metadata: { fields: Object.keys(input) } },
      tx,
    );
  });

  return getProject(actor, id);
}

export async function deleteProject(actor: Principal, id: string): Promise<void> {
  const { rows } = await db().query<{ name: string }>(`SELECT name FROM projects WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Project');

  await db().transaction(async (tx) => {
    // Everything project-owned cascades at the schema level.
    await tx.query(`DELETE FROM projects WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'project.deleted', entityType: 'project', entityId: id, entityLabel: rows[0]!.name },
      tx,
    );
  });
}

export async function addMember(
  actor: Principal,
  projectId: string,
  input: { userId: string; projectRole: 'LEAD' | 'MEMBER' | 'VIEWER' },
): Promise<ProjectMember[]> {
  await assertProjectAccess(actor, projectId);
  const { rows: project } = await db().query<{ name: string }>(`SELECT name FROM projects WHERE id = $1`, [projectId]);
  if (!project[0]) throw notFound('Project');

  await db().transaction(async (tx) => {
    const { rows: exists } = await tx.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 AND status = 'ACTIVE'`,
      [input.userId],
    );
    if (!exists[0]) throw notFound('User');

    await tx.query(
      `INSERT INTO project_members (project_id, user_id, project_role) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET project_role = EXCLUDED.project_role`,
      [projectId, input.userId, input.projectRole],
    );
    await recordActivity(
      { actorId: actor.id, action: 'project.member_added', entityType: 'project', entityId: projectId, projectId, metadata: { userId: input.userId, role: input.projectRole } },
      tx,
    );
  });

  await notify({
    userIds: [input.userId],
    kind: 'SYSTEM',
    title: `Added to ${project[0]!.name}`,
    body: `${actor.name} added you to the project.`,
    link: `/projects/${projectId}`,
    actorId: actor.id,
  });

  return listMembers(projectId);
}

export async function removeMember(actor: Principal, projectId: string, userId: string): Promise<ProjectMember[]> {
  await assertProjectAccess(actor, projectId);

  await db().transaction(async (tx) => {
    // A project must keep at least one lead, or it becomes unmanageable.
    const { rows: leads } = await tx.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM project_members WHERE project_id = $1 AND project_role = 'LEAD'`,
      [projectId],
    );
    const { rows: target } = await tx.query<{ project_role: string }>(
      `SELECT project_role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId],
    );
    if (!target[0]) throw notFound('Member');
    if (target[0].project_role === 'LEAD' && (leads[0]?.n ?? 0) <= 1) {
      throw conflict('Assign another lead before removing the last one.');
    }

    await tx.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [projectId, userId]);
    // Their open work is unassigned rather than deleted, so nothing is lost.
    await tx.query(
      `UPDATE tasks SET assignee_id = NULL WHERE project_id = $1 AND assignee_id = $2 AND status <> 'DONE'`,
      [projectId, userId],
    );
    await recordActivity(
      { actorId: actor.id, action: 'project.member_removed', entityType: 'project', entityId: projectId, projectId, metadata: { userId } },
      tx,
    );
  });

  return listMembers(projectId);
}

/** Lightweight list for pickers and filter dropdowns. */
export async function projectOptions(
  actor: Principal,
): Promise<Array<Pick<Project, 'id' | 'name' | 'key' | 'color' | 'status'> & { openTasks: number }>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'p.id');
  where.raw('p.archived_at IS NULL');
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT p.id, p.name, p.key, p.color, p.status,
            (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status <> 'DONE') AS open_tasks
       FROM projects p ${where.sql} ORDER BY p.name`,
    where.params,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    key: r.key as string,
    color: r.color as string,
    status: r.status as Project['status'],
    openTasks: (r.open_tasks as number) ?? 0,
  }));
}
