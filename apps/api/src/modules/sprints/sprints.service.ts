import type { Sprint } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { conflict, notFound } from '../../lib/errors.js';
import { iso } from '../../lib/serialize.js';
import { recordActivity } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import type { Principal } from '../../middleware/authenticate.js';
import { assertProjectAccess, visibleProjectIds } from '../common/access.js';

const SPRINT_SELECT = `
  SELECT s.id, s.project_id, s.name, s.goal, s.status, s.start_date, s.end_date,
         s.capacity_points, s.retrospective, s.created_at,
         (SELECT coalesce(sum(t.estimate), 0)::int FROM tasks t WHERE t.sprint_id = s.id) AS committed_points,
         (SELECT coalesce(sum(t.estimate), 0)::int FROM tasks t WHERE t.sprint_id = s.id AND t.status = 'DONE') AS completed_points,
         (SELECT count(*)::int FROM tasks t WHERE t.sprint_id = s.id) AS task_count,
         (SELECT count(*)::int FROM tasks t WHERE t.sprint_id = s.id AND t.status = 'DONE') AS done_task_count
    FROM sprints s
`;

function mapSprint(row: Record<string, unknown>): Sprint {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    name: row.name as string,
    goal: (row.goal as string | null) ?? null,
    status: row.status as Sprint['status'],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    capacityPoints: (row.capacity_points as number | null) ?? null,
    committedPoints: (row.committed_points as number) ?? 0,
    completedPoints: (row.completed_points as number) ?? 0,
    taskCount: (row.task_count as number) ?? 0,
    doneTaskCount: (row.done_task_count as number) ?? 0,
    retrospective: (row.retrospective as string | null) ?? null,
    burndown: [],
    createdAt: iso(row.created_at as string)!,
  };
}

/**
 * Burndown series.
 *
 * Remaining points per day are reconstructed from each task's `completed_at`,
 * so the chart is derived from the board's own history rather than from a
 * separate snapshot table that could drift out of step with it.
 */
async function buildBurndown(sprintId: string, startDate: string, endDate: string): Promise<Sprint['burndown']> {
  const { rows } = await db().query<{ estimate: number | null; completed_at: string | null }>(
    `SELECT estimate, completed_at FROM tasks WHERE sprint_id = $1`,
    [sprintId],
  );
  const total = rows.reduce((sum, r) => sum + (r.estimate ?? 0), 0);

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

  const series: Sprint['burndown'] = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const cutoff = new Date(day.getTime() + 86_400_000);
    const burned = rows
      .filter((r) => r.completed_at && new Date(r.completed_at) < cutoff)
      .reduce((sum, r) => sum + (r.estimate ?? 0), 0);
    series.push({
      date: day.toISOString().slice(0, 10),
      // Only plot actuals up to today; a future date has no real value yet.
      remaining: day > new Date() ? Number.NaN : Math.max(0, total - burned),
      ideal: Math.round((total * (days - i)) / days),
    });
  }
  return series;
}

export async function listSprints(actor: Principal, projectId?: string): Promise<Sprint[]> {
  if (projectId) await assertProjectAccess(actor, projectId);
  const scopedIds = projectId ? [projectId] : await visibleProjectIds(actor);
  if (scopedIds.length === 0) return [];

  const { rows } = await db().query<Record<string, unknown>>(
    `${SPRINT_SELECT} WHERE s.project_id = ANY($1::uuid[])
      ORDER BY CASE s.status WHEN 'ACTIVE' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END, s.start_date DESC`,
    [scopedIds],
  );
  return rows.map(mapSprint);
}

export async function getSprint(actor: Principal, id: string): Promise<Sprint> {
  const { rows } = await db().query<Record<string, unknown>>(`${SPRINT_SELECT} WHERE s.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Sprint');
  await assertProjectAccess(actor, row.project_id as string);
  const sprint = mapSprint(row);
  sprint.burndown = await buildBurndown(id, sprint.startDate, sprint.endDate);
  return sprint;
}

export async function createSprint(actor: Principal, input: Record<string, unknown>): Promise<Sprint> {
  const projectId = input.projectId as string;
  await assertProjectAccess(actor, projectId);

  const id = await db().transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, capacity_points, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        projectId, input.name, input.goal ?? null, input.status ?? 'PLANNED',
        input.startDate, input.endDate, input.capacityPoints ?? null, actor.id,
      ],
    );
    const sprintId = rows[0]!.id;
    await recordActivity(
      { actorId: actor.id, action: 'sprint.created', entityType: 'sprint', entityId: sprintId, entityLabel: input.name as string, projectId },
      tx,
    );
    return sprintId;
  });

  return getSprint(actor, id);
}

export async function updateSprint(actor: Principal, id: string, input: Record<string, unknown>): Promise<Sprint> {
  const sprint = await getSprint(actor, id);
  const columns: Record<string, string> = {
    name: 'name', goal: 'goal', startDate: 'start_date', endDate: 'end_date', capacityPoints: 'capacity_points',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) return sprint;

  await db().query(`UPDATE sprints SET ${sets.join(', ')} WHERE id = $1`, params);
  await recordActivity({
    actorId: actor.id, action: 'sprint.updated', entityType: 'sprint', entityId: id,
    entityLabel: sprint.name, projectId: sprint.projectId,
  });
  return getSprint(actor, id);
}

/**
 * Starts a sprint.
 *
 * A project may only have one active sprint, which the partial unique index
 * enforces at the database level; this check turns that constraint violation
 * into a clear message rather than a 409 from the driver.
 */
export async function startSprint(actor: Principal, id: string): Promise<Sprint> {
  const sprint = await getSprint(actor, id);
  if (sprint.status === 'ACTIVE') return sprint;
  if (sprint.status === 'COMPLETED') throw conflict('This sprint has already been completed.');

  await db().transaction(async (tx) => {
    const { rows: active } = await tx.query<{ name: string }>(
      `SELECT name FROM sprints WHERE project_id = $1 AND status = 'ACTIVE'`,
      [sprint.projectId],
    );
    if (active[0]) throw conflict(`"${active[0].name}" is already running. Complete it first.`);

    await tx.query(
      `UPDATE sprints SET status = 'ACTIVE', started_at = now() WHERE id = $1`,
      [id],
    );
    await recordActivity(
      { actorId: actor.id, action: 'sprint.started', entityType: 'sprint', entityId: id, entityLabel: sprint.name, projectId: sprint.projectId },
      tx,
    );
  });

  const { rows: members } = await db().query<{ user_id: string }>(
    `SELECT user_id FROM project_members WHERE project_id = $1`,
    [sprint.projectId],
  );
  await notify({
    userIds: members.map((m) => m.user_id),
    kind: 'SPRINT_STARTED',
    title: `${sprint.name} has started`,
    body: sprint.goal ?? undefined,
    link: `/sprints/${id}`,
    actorId: actor.id,
  });

  return getSprint(actor, id);
}

/**
 * Completes a sprint, moving unfinished work somewhere explicit.
 *
 * Carrying work over is a decision, not a default, which is why the destination
 * is a required part of the request rather than an assumption.
 */
export async function completeSprint(
  actor: Principal,
  id: string,
  input: { moveUnfinishedTo: string; retrospective?: string },
): Promise<Sprint> {
  const sprint = await getSprint(actor, id);
  if (sprint.status === 'COMPLETED') throw conflict('This sprint is already complete.');

  await db().transaction(async (tx) => {
    const target = input.moveUnfinishedTo === 'BACKLOG' ? null : input.moveUnfinishedTo;

    if (target) {
      const { rows } = await tx.query<{ project_id: string; status: string }>(
        `SELECT project_id, status FROM sprints WHERE id = $1`,
        [target],
      );
      // Carrying work into another project's sprint would move it out of view.
      if (!rows[0] || rows[0].project_id !== sprint.projectId) {
        throw conflict('The destination sprint must belong to the same project.');
      }
    }

    await tx.query(
      `UPDATE tasks SET sprint_id = $2, status = CASE WHEN $2 IS NULL THEN 'BACKLOG' ELSE status END
        WHERE sprint_id = $1 AND status <> 'DONE'`,
      [id, target],
    );
    await tx.query(
      `UPDATE sprints SET status = 'COMPLETED', completed_at = now(), retrospective = COALESCE($2, retrospective)
        WHERE id = $1`,
      [id, input.retrospective ?? null],
    );
    await recordActivity(
      {
        actorId: actor.id, action: 'sprint.completed', entityType: 'sprint', entityId: id,
        entityLabel: sprint.name, projectId: sprint.projectId,
        metadata: { movedTo: input.moveUnfinishedTo, completedPoints: sprint.completedPoints },
      },
      tx,
    );
  });

  const { rows: members } = await db().query<{ user_id: string }>(
    `SELECT user_id FROM project_members WHERE project_id = $1`,
    [sprint.projectId],
  );
  await notify({
    userIds: members.map((m) => m.user_id),
    kind: 'SPRINT_COMPLETED',
    title: `${sprint.name} is complete`,
    body: `${sprint.completedPoints} of ${sprint.committedPoints} points delivered.`,
    link: `/sprints/${id}`,
    actorId: actor.id,
  });

  return getSprint(actor, id);
}

export async function deleteSprint(actor: Principal, id: string): Promise<void> {
  const sprint = await getSprint(actor, id);
  await db().transaction(async (tx) => {
    // Tasks survive the sprint; they fall back to the backlog.
    await tx.query(`UPDATE tasks SET sprint_id = NULL WHERE sprint_id = $1`, [id]);
    await tx.query(`DELETE FROM sprints WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'sprint.deleted', entityType: 'sprint', entityId: id, entityLabel: sprint.name, projectId: sprint.projectId },
      tx,
    );
  });
}

/** Velocity over recent completed sprints, for planning the next one. */
export async function velocity(actor: Principal, projectId: string): Promise<Array<{ sprint: string; committed: number; completed: number }>> {
  await assertProjectAccess(actor, projectId);
  const { rows } = await db().query<{ name: string; committed: number; completed: number }>(
    `SELECT s.name,
            (SELECT coalesce(sum(t.estimate),0)::int FROM tasks t WHERE t.sprint_id = s.id) AS committed,
            (SELECT coalesce(sum(t.estimate),0)::int FROM tasks t WHERE t.sprint_id = s.id AND t.status='DONE') AS completed
       FROM sprints s
      WHERE s.project_id = $1 AND s.status = 'COMPLETED'
      ORDER BY s.end_date DESC LIMIT 8`,
    [projectId],
  );
  return rows.reverse().map((r) => ({ sprint: r.name, committed: r.committed, completed: r.completed }));
}
