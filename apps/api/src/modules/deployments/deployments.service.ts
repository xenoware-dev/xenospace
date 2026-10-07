import type { Deployment, Paginated } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { paginate } from '../../lib/http.js';
import { recordActivity, writeAudit } from '../../middleware/audit.js';
import { notify } from '../notifications/notifications.service.js';
import { realtime } from '../../realtime/socket.js';
import type { Principal } from '../../middleware/authenticate.js';
import { applyProjectScope, assertProjectAccess, isAdmin, WhereBuilder } from '../common/access.js';

const DEPLOY_SELECT = `
  SELECT d.id, d.project_id, d.repository_id, d.environment, d.version, d.status,
         d.commit_sha, d.branch, d.notes, d.log_url, d.duration_seconds,
         d.created_at, d.finished_at,
         ${userJoinColumns('t', 'triggered')},
         ${userJoinColumns('ap', 'approved')}
    FROM deployments d
    LEFT JOIN users t ON t.id = d.triggered_by
    LEFT JOIN users ap ON ap.id = d.approved_by
`;

function mapDeployment(row: Record<string, unknown>): Deployment {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    repositoryId: (row.repository_id as string | null) ?? null,
    environment: row.environment as Deployment['environment'],
    version: row.version as string,
    status: row.status as Deployment['status'],
    commitSha: (row.commit_sha as string | null) ?? null,
    branch: (row.branch as string | null) ?? null,
    triggeredBy: nestedUser(row, 'triggered') ?? {
      id: 'system', name: 'Automation', email: '', role: 'DEVELOPER', status: 'ACTIVE',
      avatarUrl: null, avatarColor: '#64748b', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    approvedBy: nestedUser(row, 'approved'),
    notes: (row.notes as string | null) ?? null,
    logUrl: (row.log_url as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    createdAt: iso(row.created_at as string)!,
    finishedAt: iso(row.finished_at as string | null),
  };
}

export async function listDeployments(
  actor: Principal,
  f: { page: number; pageSize: number; projectId?: string; environment?: string[]; status?: string[] },
): Promise<Paginated<Deployment>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'd.project_id');
  where.addIf(f.projectId, `d.project_id = ?`, f.projectId);
  where.addIf(f.environment, `d.environment = ANY(?::text[])`, f.environment);
  where.addIf(f.status, `d.status = ANY(?::text[])`, f.status);

  const offset = (f.page - 1) * f.pageSize;
  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${DEPLOY_SELECT} ${where.sql} ORDER BY d.created_at DESC LIMIT ${f.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(`SELECT count(*)::int AS n FROM deployments d ${where.sql}`, where.params),
  ]);

  return paginate(rows.map(mapDeployment), counts[0]?.n ?? 0, f.page, f.pageSize);
}

export async function getDeployment(actor: Principal, id: string): Promise<Deployment> {
  const { rows } = await db().query<Record<string, unknown>>(`${DEPLOY_SELECT} WHERE d.id = $1`, [id]);
  const row = rows[0];
  if (!row) throw notFound('Deployment');
  await assertProjectAccess(actor, row.project_id as string);
  return mapDeployment(row);
}

/**
 * Queues a deployment.
 *
 * A production deploy requires a team lead. The permission system allows a
 * developer to create a deployment, so the environment check is what keeps that
 * from reaching production — the dangerous case is specifically this one.
 */
export async function createDeployment(actor: Principal, input: Record<string, unknown>): Promise<Deployment> {
  const projectId = input.projectId as string;
  await assertProjectAccess(actor, projectId);

  const environment = input.environment as Deployment['environment'];
  if (environment === 'PRODUCTION' && !isAdmin(actor)) {
    throw forbidden('A team lead must approve production deployments.');
  }

  const id = await db().transaction(async (tx) => {
    // One in-flight deployment per environment, so two releases cannot race.
    const { rows: inFlight } = await tx.query<{ version: string }>(
      `SELECT version FROM deployments
        WHERE project_id = $1 AND environment = $2
          AND status IN ('QUEUED', 'BUILDING', 'DEPLOYING')`,
      [projectId, environment],
    );
    if (inFlight[0]) {
      throw conflict(`${inFlight[0].version} is already deploying to ${environment.toLowerCase()}.`);
    }

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO deployments (project_id, repository_id, environment, version, commit_sha,
                                branch, notes, triggered_by, approved_by, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'QUEUED') RETURNING id`,
      [
        projectId, input.repositoryId ?? null, environment, input.version,
        input.commitSha ?? null, input.branch ?? null, input.notes ?? null, actor.id,
        // A production deploy records its approver at creation time.
        environment === 'PRODUCTION' ? actor.id : null,
      ],
    );
    const deployId = rows[0]!.id;
    await recordActivity(
      { actorId: actor.id, action: 'deployment.queued', entityType: 'deployment', entityId: deployId, entityLabel: `${input.version} → ${environment}`, projectId, metadata: { environment } },
      tx,
    );
    await writeAudit(
      { actorId: actor.id, action: 'deployment.create', resource: 'deployment', resourceId: deployId, metadata: { environment, version: input.version } },
      tx,
    );
    return deployId;
  });

  const deployment = await getDeployment(actor, id);
  realtime.toProject(projectId, 'deployment:updated', { deployment });

  if (environment === 'PRODUCTION') {
    const { rows: members } = await db().query<{ user_id: string }>(
      `SELECT user_id FROM project_members WHERE project_id = $1`,
      [projectId],
    );
    await notify({
      userIds: members.map((m) => m.user_id), kind: 'DEPLOY_STATUS',
      title: `Production deploy started: ${deployment.version}`,
      link: `/deployments/${id}`, actorId: actor.id,
    });
  }
  return deployment;
}

/** Advances a deployment's status; terminal states stamp `finished_at`. */
export async function updateDeployment(
  actor: Principal,
  id: string,
  input: { status: Deployment['status']; logUrl?: string; durationSeconds?: number; notes?: string },
): Promise<Deployment> {
  const existing = await getDeployment(actor, id);

  const terminal = ['SUCCEEDED', 'FAILED', 'ROLLED_BACK'];
  if (terminal.includes(existing.status) && existing.status !== input.status) {
    throw conflict('This deployment has already finished.');
  }

  await db().transaction(async (tx) => {
    await tx.query(
      `UPDATE deployments
          SET status = $2,
              log_url = COALESCE($3, log_url),
              duration_seconds = COALESCE($4, duration_seconds),
              notes = COALESCE($5, notes),
              finished_at = CASE WHEN $2 = ANY($6::text[]) THEN now() ELSE finished_at END
        WHERE id = $1`,
      [id, input.status, input.logUrl ?? null, input.durationSeconds ?? null, input.notes ?? null, terminal],
    );
    await recordActivity(
      { actorId: actor.id, action: `deployment.${input.status.toLowerCase()}`, entityType: 'deployment', entityId: id, entityLabel: `${existing.version} → ${existing.environment}`, projectId: existing.projectId },
      tx,
    );
  });

  const deployment = await getDeployment(actor, id);
  realtime.toProject(deployment.projectId, 'deployment:updated', { deployment });

  // A failure is told to the whole project; a success only to whoever triggered it.
  if (input.status === 'FAILED') {
    const { rows: members } = await db().query<{ user_id: string }>(
      `SELECT user_id FROM project_members WHERE project_id = $1`,
      [deployment.projectId],
    );
    await notify({
      userIds: members.map((m) => m.user_id), kind: 'DEPLOY_STATUS',
      title: `Deploy failed: ${deployment.version} → ${deployment.environment.toLowerCase()}`,
      body: input.notes ?? undefined, link: `/deployments/${id}`, actorId: actor.id,
    });
  } else if (input.status === 'SUCCEEDED') {
    await notify({
      userIds: [existing.triggeredBy.id], kind: 'DEPLOY_STATUS',
      title: `Deploy succeeded: ${deployment.version}`,
      link: `/deployments/${id}`, actorId: actor.id,
    });
  }
  return deployment;
}

/** Rolls back by recording a new deployment of the previous good version. */
export async function rollback(actor: Principal, id: string): Promise<Deployment> {
  const target = await getDeployment(actor, id);
  if (!isAdmin(actor) && target.environment === 'PRODUCTION') {
    throw forbidden('Only a team lead can roll back production.');
  }

  const { rows: previous } = await db().query<{ version: string; commit_sha: string | null }>(
    `SELECT version, commit_sha FROM deployments
      WHERE project_id = $1 AND environment = $2 AND status = 'SUCCEEDED' AND id <> $3
      ORDER BY created_at DESC LIMIT 1`,
    [target.projectId, target.environment, id],
  );
  const last = previous[0];
  if (!last) throw conflict('There is no earlier successful deployment to roll back to.');

  const newId = await db().transaction(async (tx) => {
    await tx.query(`UPDATE deployments SET status = 'ROLLED_BACK', finished_at = now() WHERE id = $1`, [id]);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO deployments (project_id, repository_id, environment, version, commit_sha,
                                triggered_by, approved_by, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$6,'QUEUED',$7) RETURNING id`,
      [
        target.projectId, target.repositoryId, target.environment, last.version,
        last.commit_sha, actor.id, `Rollback from ${target.version}`,
      ],
    );
    const rollbackId = rows[0]!.id;
    await writeAudit(
      { actorId: actor.id, action: 'deployment.rollback', resource: 'deployment', resourceId: id, metadata: { from: target.version, to: last.version, environment: target.environment } },
      tx,
    );
    await recordActivity(
      { actorId: actor.id, action: 'deployment.rolled_back', entityType: 'deployment', entityId: rollbackId, entityLabel: `${target.version} → ${last.version}`, projectId: target.projectId },
      tx,
    );
    return rollbackId;
  });

  const { rows: members } = await db().query<{ user_id: string }>(
    `SELECT user_id FROM project_members WHERE project_id = $1`,
    [target.projectId],
  );
  await notify({
    userIds: members.map((m) => m.user_id), kind: 'DEPLOY_STATUS',
    title: `Rolled back ${target.environment.toLowerCase()} to ${last.version}`,
    link: `/deployments/${newId}`, actorId: actor.id,
  });

  return getDeployment(actor, newId);
}

/** Per-environment current version and success rate, for the deployments page. */
export async function environmentStatus(
  actor: Principal,
  projectId?: string,
): Promise<Array<{ environment: string; current: Deployment | null; successRate: number; total: number; lastFailureAt: string | null }>> {
  const where = new WhereBuilder();
  applyProjectScope(where, actor, 'd.project_id');
  where.addIf(projectId, `d.project_id = ?`, projectId);

  const { rows: stats } = await db().query<{
    environment: string; total: number; succeeded: number; last_failure: string | null;
  }>(
    `SELECT d.environment,
            count(*)::int AS total,
            count(*) FILTER (WHERE d.status = 'SUCCEEDED')::int AS succeeded,
            max(d.created_at) FILTER (WHERE d.status = 'FAILED') AS last_failure
       FROM deployments d ${where.sql} GROUP BY d.environment`,
    where.params,
  );

  const out: Array<{ environment: string; current: Deployment | null; successRate: number; total: number; lastFailureAt: string | null }> = [];
  for (const env of ['DEVELOPMENT', 'STAGING', 'PRODUCTION']) {
    const stat = stats.find((s) => s.environment === env);
    const currentWhere = new WhereBuilder();
    applyProjectScope(currentWhere, actor, 'd.project_id');
    currentWhere.addIf(projectId, `d.project_id = ?`, projectId);
    currentWhere.add(`d.environment = ?`, env);
    currentWhere.raw(`d.status = 'SUCCEEDED'`);

    const { rows } = await db().query<Record<string, unknown>>(
      `${DEPLOY_SELECT} ${currentWhere.sql} ORDER BY d.created_at DESC LIMIT 1`,
      currentWhere.params,
    );
    out.push({
      environment: env,
      current: rows[0] ? mapDeployment(rows[0]) : null,
      successRate: stat && stat.total > 0 ? Math.round((stat.succeeded / stat.total) * 100) : 0,
      total: stat?.total ?? 0,
      lastFailureAt: iso(stat?.last_failure ?? null),
    });
  }
  return out;
}
