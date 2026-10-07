import type {
  AdminDashboard, DeveloperDashboard, Priority, ReportBundle, Severity, TaskStatus, TaskType,
} from '@xenospace/shared';
import { db } from '../../db/index.js';
import { iso, nestedUser, userJoinColumns, PUBLIC_USER_COLUMNS, toPublicUser, type UserRow } from '../../lib/serialize.js';
import type { Principal } from '../../middleware/authenticate.js';
import { isAdmin, visibleProjectIds } from '../common/access.js';
import { listActivity } from '../activity/activity.service.js';
import { upcoming } from '../calendar/calendar.service.js';
import * as auth from '../auth/auth.service.js';

/**
 * Dashboard analytics.
 *
 * Every figure is scoped to what the viewer may see: the admin dashboard spans
 * the workspace, the developer dashboard is about one person's own work. Each
 * builds its aggregates in a small number of grouped queries rather than
 * iterating, so adding projects does not multiply round trips.
 */

/** Dense day series, so a chart has no gaps where nothing happened. */
function dateSeries(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export async function adminDashboard(actor: Principal): Promise<AdminDashboard> {
  const projectIds = await visibleProjectIds(actor);
  // An empty workspace must render, not divide by zero.
  const scope = projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000'];

  const [
    kpis, throughputRows, statusRows, severityRows, workloadRows,
    deployRows, velocityRows, progressRows,
  ] = await Promise.all([
    db().query<{
      active_projects: number; open_tasks: number; overdue_tasks: number; open_issues: number;
      critical_issues: number; pending_reviews: number; deploys_week: number; team_size: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM projects WHERE status = 'ACTIVE' AND id = ANY($1::uuid[])) AS active_projects,
         (SELECT count(*)::int FROM tasks WHERE status <> 'DONE' AND project_id = ANY($1::uuid[])) AS open_tasks,
         (SELECT count(*)::int FROM tasks WHERE status <> 'DONE' AND due_date < current_date
            AND project_id = ANY($1::uuid[])) AS overdue_tasks,
         (SELECT count(*)::int FROM issues WHERE status NOT IN ('RESOLVED','CLOSED','WONT_FIX')
            AND project_id = ANY($1::uuid[])) AS open_issues,
         (SELECT count(*)::int FROM issues WHERE severity = 'S1'
            AND status NOT IN ('RESOLVED','CLOSED','WONT_FIX') AND project_id = ANY($1::uuid[])) AS critical_issues,
         (SELECT count(*)::int FROM code_reviews WHERE status IN ('OPEN','CHANGES_REQUESTED')
            AND project_id = ANY($1::uuid[])) AS pending_reviews,
         (SELECT count(*)::int FROM deployments WHERE created_at >= now() - interval '7 days'
            AND project_id = ANY($1::uuid[])) AS deploys_week,
         (SELECT count(*)::int FROM users WHERE status = 'ACTIVE') AS team_size`,
      [scope],
    ),
    db().query<{ date: string; created: number; completed: number }>(
      `WITH days AS (
         SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              (SELECT count(*)::int FROM tasks t
                 WHERE t.project_id = ANY($1::uuid[]) AND t.created_at::date = d.day) AS created,
              (SELECT count(*)::int FROM tasks t
                 WHERE t.project_id = ANY($1::uuid[]) AND t.completed_at::date = d.day) AS completed
         FROM days d ORDER BY d.day`,
      [scope],
    ),
    db().query<{ status: TaskStatus; count: number }>(
      `SELECT status, count(*)::int AS count FROM tasks
        WHERE project_id = ANY($1::uuid[]) GROUP BY status`,
      [scope],
    ),
    db().query<{ severity: Severity; count: number }>(
      `SELECT severity, count(*)::int AS count FROM issues
        WHERE project_id = ANY($1::uuid[]) AND status NOT IN ('RESOLVED','CLOSED','WONT_FIX')
        GROUP BY severity`,
      [scope],
    ),
    db().query<Record<string, unknown>>(
      `SELECT ${PUBLIC_USER_COLUMNS.split(',').map((c) => `u.${c.trim()}`).join(', ')},
              u.weekly_hours,
              count(t.id) FILTER (WHERE t.status <> 'DONE')::int AS open_tasks,
              coalesce(sum(t.estimate) FILTER (WHERE t.status <> 'DONE'), 0)::int AS points
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id AND t.project_id = ANY($1::uuid[])
        WHERE u.status = 'ACTIVE'
        GROUP BY u.id, u.email, u.name, u.role, u.status, u.avatar_url, u.avatar_color,
                 u.job_title, u.presence, u.last_seen_at, u.weekly_hours
        ORDER BY open_tasks DESC LIMIT 20`,
      [scope],
    ),
    db().query<{ succeeded: number; failed: number; rolled_back: number }>(
      `SELECT count(*) FILTER (WHERE status = 'SUCCEEDED')::int AS succeeded,
              count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
              count(*) FILTER (WHERE status = 'ROLLED_BACK')::int AS rolled_back
         FROM deployments WHERE project_id = ANY($1::uuid[])
           AND created_at >= now() - interval '90 days'`,
      [scope],
    ),
    db().query<{ sprint: string; committed: number; completed: number }>(
      `SELECT s.name AS sprint,
              (SELECT coalesce(sum(t.estimate),0)::int FROM tasks t WHERE t.sprint_id = s.id) AS committed,
              (SELECT coalesce(sum(t.estimate),0)::int FROM tasks t
                 WHERE t.sprint_id = s.id AND t.status = 'DONE') AS completed
         FROM sprints s
        WHERE s.project_id = ANY($1::uuid[]) AND s.status = 'COMPLETED'
        ORDER BY s.end_date DESC LIMIT 8`,
      [scope],
    ),
    db().query<{ id: string; name: string; key: string; color: string; total: number; done: number; target_date: string | null }>(
      `SELECT p.id, p.name, p.key, p.color, p.target_date,
              (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS total,
              (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status='DONE') AS done
         FROM projects p
        WHERE p.id = ANY($1::uuid[]) AND p.status = 'ACTIVE'
        ORDER BY p.target_date NULLS LAST LIMIT 10`,
      [scope],
    ),
  ]);

  const k = kpis.rows[0]!;
  const deploy = deployRows.rows[0] ?? { succeeded: 0, failed: 0, rolled_back: 0 };
  const deployTotal = deploy.succeeded + deploy.failed + deploy.rolled_back;

  const [activity, events] = await Promise.all([
    listActivity(actor, { limit: 12 }),
    upcoming(actor, 5),
  ]);

  return {
    kpis: {
      activeProjects: k.active_projects,
      openTasks: k.open_tasks,
      overdueTasks: k.overdue_tasks,
      openIssues: k.open_issues,
      criticalIssues: k.critical_issues,
      pendingReviews: k.pending_reviews,
      deploysThisWeek: k.deploys_week,
      teamSize: k.team_size,
    },
    throughput: throughputRows.rows,
    velocity: velocityRows.rows.reverse(),
    workloadByMember: workloadRows.rows.map((row) => ({
      user: toPublicUser(row as unknown as UserRow),
      openTasks: (row.open_tasks as number) ?? 0,
      points: (row.points as number) ?? 0,
      // Rough capacity in points, assuming ~6 hours per point.
      capacity: Math.round((((row.weekly_hours as number) ?? 40) / 6)),
    })),
    tasksByStatus: statusRows.rows,
    issuesBySeverity: severityRows.rows,
    deploymentHealth: {
      succeeded: deploy.succeeded,
      failed: deploy.failed,
      rolledBack: deploy.rolled_back,
      successRate: deployTotal > 0 ? Math.round((deploy.succeeded / deployTotal) * 100) : 0,
    },
    recentActivity: activity.items,
    upcomingEvents: events,
    projectProgress: progressRows.rows.map((row) => ({
      project: { id: row.id, name: row.name, key: row.key, color: row.color },
      progress: row.total > 0 ? Math.round((row.done / row.total) * 100) : 0,
      dueInDays: row.target_date
        ? Math.ceil((new Date(row.target_date).getTime() - Date.now()) / 86_400_000)
        : null,
    })),
  };
}

export async function developerDashboard(actor: Principal): Promise<DeveloperDashboard> {
  const [profile, kpis, throughputRows, priorityRows, heatmapRows, sprintRow] = await Promise.all([
    auth.getCurrentUser(actor.id),
    db().query<{
      assigned: number; in_progress: number; due_today: number; overdue: number;
      completed_week: number; open_issues: number; reviews_requested: number; logged_week: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM tasks WHERE assignee_id = $1 AND status <> 'DONE') AS assigned,
         (SELECT count(*)::int FROM tasks WHERE assignee_id = $1 AND status = 'IN_PROGRESS') AS in_progress,
         (SELECT count(*)::int FROM tasks WHERE assignee_id = $1 AND status <> 'DONE'
            AND due_date = current_date) AS due_today,
         (SELECT count(*)::int FROM tasks WHERE assignee_id = $1 AND status <> 'DONE'
            AND due_date < current_date) AS overdue,
         (SELECT count(*)::int FROM tasks WHERE assignee_id = $1 AND status = 'DONE'
            AND completed_at >= now() - interval '7 days') AS completed_week,
         (SELECT count(*)::int FROM issues WHERE assignee_id = $1
            AND status NOT IN ('RESOLVED','CLOSED','WONT_FIX')) AS open_issues,
         (SELECT count(*)::int FROM review_reviewers rr
            JOIN code_reviews cr ON cr.id = rr.review_id
           WHERE rr.user_id = $1 AND rr.verdict = 'PENDING'
             AND cr.status IN ('OPEN','CHANGES_REQUESTED')) AS reviews_requested,
         (SELECT coalesce(sum(minutes),0)::int FROM time_logs
            WHERE user_id = $1 AND spent_on >= current_date - 7) AS logged_week`,
      [actor.id],
    ),
    db().query<{ date: string; completed: number; logged: number }>(
      `WITH days AS (
         SELECT generate_series(current_date - 29, current_date, interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              (SELECT count(*)::int FROM tasks t
                 WHERE t.assignee_id = $1 AND t.completed_at::date = d.day) AS completed,
              (SELECT coalesce(sum(tl.minutes),0)::int FROM time_logs tl
                 WHERE tl.user_id = $1 AND tl.spent_on = d.day) AS logged
         FROM days d ORDER BY d.day`,
      [actor.id],
    ),
    db().query<{ priority: Priority; count: number }>(
      `SELECT priority, count(*)::int AS count FROM tasks
        WHERE assignee_id = $1 AND status <> 'DONE' GROUP BY priority`,
      [actor.id],
    ),
    db().query<{ date: string; count: number }>(
      `SELECT to_char(completed_at::date, 'YYYY-MM-DD') AS date, count(*)::int AS count
         FROM tasks
        WHERE assignee_id = $1 AND completed_at >= current_date - 364
        GROUP BY 1 ORDER BY 1`,
      [actor.id],
    ),
    db().query<{ id: string }>(
      `SELECT s.id FROM sprints s
         JOIN project_members pm ON pm.project_id = s.project_id
        WHERE pm.user_id = $1 AND s.status = 'ACTIVE'
        ORDER BY s.start_date DESC LIMIT 1`,
      [actor.id],
    ),
  ]);

  const k = kpis.rows[0]!;

  // Focus list: the few things actually worth doing next, ordered by urgency
  // then by what is already in flight.
  const { rows: focusRows } = await db().query<Record<string, unknown>>(
    `SELECT t.id, t.project_id, t.number, t.title, t.description, t.type, t.status, t.priority,
            t.sprint_id, t.parent_task_id, t.estimate, t.position, t.due_date, t.labels,
            t.created_at, t.updated_at, t.completed_at,
            p.key AS project_key, p.name AS project_name, p.color AS project_color,
            ${userJoinColumns('a', 'assignee')}, ${userJoinColumns('r', 'reporter')}
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users a ON a.id = t.assignee_id
       LEFT JOIN users r ON r.id = t.reporter_id
      WHERE t.assignee_id = $1 AND t.status <> 'DONE'
      ORDER BY
        CASE WHEN t.due_date < current_date THEN 0 ELSE 1 END,
        CASE t.priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC,
        CASE t.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,
        t.due_date NULLS LAST
      LIMIT 8`,
    [actor.id],
  );

  const { rows: reviewRows } = await db().query<Record<string, unknown>>(
    `SELECT cr.id, cr.project_id, cr.repository_id, cr.number, cr.title, cr.description, cr.status,
            cr.source_branch, cr.target_branch, cr.external_number, cr.external_url,
            cr.additions, cr.deletions, cr.changed_files, cr.linked_task_id,
            cr.created_at, cr.updated_at, cr.merged_at, p.key AS project_key,
            ${userJoinColumns('au', 'author')}
       FROM code_reviews cr
       JOIN projects p ON p.id = cr.project_id
       JOIN review_reviewers rr ON rr.review_id = cr.id AND rr.user_id = $1
       LEFT JOIN users au ON au.id = cr.author_id
      WHERE rr.verdict = 'PENDING' AND cr.status IN ('OPEN','CHANGES_REQUESTED')
      ORDER BY cr.updated_at DESC LIMIT 6`,
    [actor.id],
  );

  const { rows: issueRows } = await db().query<Record<string, unknown>>(
    `SELECT i.id, i.project_id, i.number, i.title, i.description, i.kind, i.severity, i.status,
            i.steps_to_reproduce, i.expected_behaviour, i.actual_behaviour, i.environment,
            i.affected_version, i.labels, i.linked_task_id, i.resolution,
            i.created_at, i.updated_at, i.resolved_at,
            p.key AS project_key, p.name AS project_name, p.color AS project_color,
            ${userJoinColumns('a', 'assignee')}, ${userJoinColumns('r', 'reporter')}
       FROM issues i
       JOIN projects p ON p.id = i.project_id
       LEFT JOIN users a ON a.id = i.assignee_id
       LEFT JOIN users r ON r.id = i.reporter_id
      WHERE i.assignee_id = $1 AND i.status NOT IN ('RESOLVED','CLOSED','WONT_FIX')
      ORDER BY CASE i.severity WHEN 'S1' THEN 4 WHEN 'S2' THEN 3 WHEN 'S3' THEN 2 ELSE 1 END DESC,
               i.updated_at DESC
      LIMIT 6`,
    [actor.id],
  );

  // Consecutive days ending today (or yesterday) with at least one completion.
  const completedDays = new Set(heatmapRows.rows.map((r) => r.date));
  let streakDays = 0;
  for (let i = 0; i < 365; i++) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    if (completedDays.has(day)) streakDays++;
    // Today not yet having a completion should not break yesterday's streak.
    else if (i > 0) break;
  }

  const heatmapByDate = new Map(heatmapRows.rows.map((r) => [r.date, r.count]));
  const contributionHeatmap = dateSeries(365).map((date) => ({
    date,
    count: heatmapByDate.get(date) ?? 0,
  }));

  const [events, activeSprint] = await Promise.all([
    upcoming(actor, 5),
    sprintRow.rows[0]
      ? (await import('../sprints/sprints.service.js')).getSprint(actor, sprintRow.rows[0].id).catch(() => null)
      : Promise.resolve(null),
  ]);

  const { mapTaskRows, mapReviewRows, mapIssueRows } = await import('./dashboard.mappers.js');

  return {
    profile,
    kpis: {
      assignedTasks: k.assigned,
      inProgress: k.in_progress,
      dueToday: k.due_today,
      overdue: k.overdue,
      completedThisWeek: k.completed_week,
      openIssues: k.open_issues,
      reviewsRequested: k.reviews_requested,
      loggedMinutesThisWeek: k.logged_week,
    },
    personalThroughput: throughputRows.rows,
    tasksByPriority: priorityRows.rows,
    focusTasks: mapTaskRows(focusRows),
    reviewQueue: mapReviewRows(reviewRows),
    myIssues: mapIssueRows(issueRows),
    upcomingEvents: events,
    activeSprint,
    streakDays,
    contributionHeatmap,
  };
}

/* ------------------------------------------------------------------- reports */

export async function report(
  actor: Principal,
  f: { projectId?: string; sprintId?: string; from?: string; to?: string },
): Promise<ReportBundle> {
  const projectIds = f.projectId ? [f.projectId] : await visibleProjectIds(actor);
  const scope = projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000'];
  const from = f.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const to = f.to ?? new Date().toISOString();

  const [summary, flowRows, memberRows, cycleRows] = await Promise.all([
    db().query<{
      tasks_completed: number; tasks_created: number; issues_resolved: number;
      reviews_merged: number; deployments: number; avg_cycle: number | null; avg_review: number | null;
    }>(
      `SELECT
         (SELECT count(*)::int FROM tasks WHERE project_id = ANY($1::uuid[])
            AND completed_at BETWEEN $2 AND $3) AS tasks_completed,
         (SELECT count(*)::int FROM tasks WHERE project_id = ANY($1::uuid[])
            AND created_at BETWEEN $2 AND $3) AS tasks_created,
         (SELECT count(*)::int FROM issues WHERE project_id = ANY($1::uuid[])
            AND resolved_at BETWEEN $2 AND $3) AS issues_resolved,
         (SELECT count(*)::int FROM code_reviews WHERE project_id = ANY($1::uuid[])
            AND merged_at BETWEEN $2 AND $3) AS reviews_merged,
         (SELECT count(*)::int FROM deployments WHERE project_id = ANY($1::uuid[])
            AND created_at BETWEEN $2 AND $3) AS deployments,
         (SELECT avg(extract(epoch FROM (completed_at - created_at)) / 3600) FROM tasks
            WHERE project_id = ANY($1::uuid[]) AND completed_at BETWEEN $2 AND $3) AS avg_cycle,
         (SELECT avg(extract(epoch FROM (merged_at - created_at)) / 3600) FROM code_reviews
            WHERE project_id = ANY($1::uuid[]) AND merged_at BETWEEN $2 AND $3) AS avg_review`,
      [scope, from, to],
    ),
    db().query<Record<string, unknown>>(
      `WITH days AS (
         SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
              (SELECT count(*)::int FROM tasks t WHERE t.project_id = ANY($1::uuid[])
                 AND t.created_at::date <= d.day AND t.status = 'TODO') AS "TODO",
              (SELECT count(*)::int FROM tasks t WHERE t.project_id = ANY($1::uuid[])
                 AND t.created_at::date <= d.day AND t.status = 'IN_PROGRESS') AS "IN_PROGRESS",
              (SELECT count(*)::int FROM tasks t WHERE t.project_id = ANY($1::uuid[])
                 AND t.created_at::date <= d.day AND t.status = 'IN_REVIEW') AS "IN_REVIEW",
              (SELECT count(*)::int FROM tasks t WHERE t.project_id = ANY($1::uuid[])
                 AND t.completed_at::date <= d.day) AS "DONE"
         FROM days d ORDER BY d.day`,
      [scope, from.slice(0, 10), to.slice(0, 10)],
    ),
    db().query<Record<string, unknown>>(
      `SELECT ${PUBLIC_USER_COLUMNS.split(',').map((c) => `u.${c.trim()}`).join(', ')},
              count(t.id) FILTER (WHERE t.completed_at BETWEEN $2 AND $3)::int AS completed,
              coalesce(sum(t.estimate) FILTER (WHERE t.completed_at BETWEEN $2 AND $3), 0)::int AS points,
              (SELECT coalesce(sum(tl.minutes),0)::int FROM time_logs tl
                 WHERE tl.user_id = u.id AND tl.spent_on BETWEEN $2::date AND $3::date) AS logged
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id AND t.project_id = ANY($1::uuid[])
        WHERE u.status = 'ACTIVE'
        GROUP BY u.id, u.email, u.name, u.role, u.status, u.avatar_url, u.avatar_color,
                 u.job_title, u.presence, u.last_seen_at
        ORDER BY completed DESC LIMIT 25`,
      [scope, from, to],
    ),
    db().query<{ type: TaskType; hours: number }>(
      `SELECT type,
              round(avg(extract(epoch FROM (completed_at - created_at)) / 3600)::numeric, 1) AS hours
         FROM tasks
        WHERE project_id = ANY($1::uuid[]) AND completed_at BETWEEN $2 AND $3
        GROUP BY type`,
      [scope, from, to],
    ),
  ]);

  const s = summary.rows[0]!;

  // Burndown for the report comes from the named sprint when one is given.
  let burndown: ReportBundle['burndown'] = [];
  if (f.sprintId) {
    const { getSprint } = await import('../sprints/sprints.service.js');
    burndown = (await getSprint(actor, f.sprintId)).burndown;
  }

  return {
    generatedAt: new Date().toISOString(),
    range: { from, to },
    summary: {
      tasksCompleted: s.tasks_completed,
      tasksCreated: s.tasks_created,
      issuesResolved: s.issues_resolved,
      reviewsMerged: s.reviews_merged,
      deployments: s.deployments,
      avgCycleTimeHours: s.avg_cycle === null ? null : Math.round(Number(s.avg_cycle) * 10) / 10,
      avgReviewTimeHours: s.avg_review === null ? null : Math.round(Number(s.avg_review) * 10) / 10,
    },
    burndown,
    cumulativeFlow: flowRows.rows as ReportBundle['cumulativeFlow'],
    memberBreakdown: memberRows.rows.map((row) => ({
      user: toPublicUser(row as unknown as UserRow),
      completed: (row.completed as number) ?? 0,
      points: (row.points as number) ?? 0,
      loggedMinutes: (row.logged as number) ?? 0,
    })),
    cycleTimeByType: cycleRows.rows.map((r) => ({ type: r.type, hours: Number(r.hours) || 0 })),
  };
}
