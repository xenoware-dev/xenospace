import type { ActivityEntry } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import type { Principal } from '../../middleware/authenticate.js';
import { applyProjectScope, isAdmin, WhereBuilder } from '../common/access.js';

/** Product activity feed, and the separate security audit view. */

function mapActivity(row: Record<string, unknown>): ActivityEntry {
  return {
    id: row.id as string,
    actor: nestedUser(row, 'actor'),
    action: row.action as string,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string | null) ?? null,
    entityLabel: (row.entity_label as string | null) ?? null,
    projectId: (row.project_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: iso(row.created_at as string)!,
  };
}

export async function listActivity(
  actor: Principal,
  f: { limit: number; cursor?: string; projectId?: string; actorId?: string; entityType?: string; from?: string; to?: string },
): Promise<{ items: ActivityEntry[]; nextCursor: string | null }> {
  const where = new WhereBuilder();

  /*
   * Project-scoped entries follow project visibility. Entries with no project
   * (role changes, workspace events) are team-lead only, since they describe
   * administration a developer has no business seeing.
   */
  if (isAdmin(actor)) {
    where.addIf(f.projectId, `a.project_id = ?`, f.projectId);
  } else {
    where.add(
      `(a.project_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = a.project_id AND pm.user_id = ?
        ))`,
      actor.id,
    );
    where.addIf(f.projectId, `a.project_id = ?`, f.projectId);
  }

  where.addIf(f.entityType, `a.entity_type = ?`, f.entityType);
  where.addIf(f.from, `a.created_at >= ?`, f.from);
  where.addIf(f.to, `a.created_at <= ?`, f.to);
  if (f.actorId === 'me') where.add(`a.actor_id = ?`, actor.id);
  else if (f.actorId) where.add(`a.actor_id = ?`, f.actorId);
  where.addIf(f.cursor, `a.created_at < ?`, f.cursor);

  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.entity_label, a.project_id,
            a.metadata, a.created_at, ${userJoinColumns('u', 'actor')}
       FROM activity_log a LEFT JOIN users u ON u.id = a.actor_id
       ${where.sql}
      ORDER BY a.created_at DESC LIMIT ${f.limit + 1}`,
    where.params,
  );

  const hasMore = rows.length > f.limit;
  const items = (hasMore ? rows.slice(0, f.limit) : rows).map(mapActivity);
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? last.createdAt : null };
}

/**
 * Security audit trail. Gated on `audit:read`, which only a team lead holds —
 * it records authorization denials and privileged actions across the workspace.
 */
export async function listAudit(f: {
  limit: number; cursor?: string; action?: string; actorId?: string; outcome?: string;
}): Promise<{ items: Array<Record<string, unknown>>; nextCursor: string | null }> {
  const where = new WhereBuilder();
  where.addIf(f.action, `al.action = ?`, f.action);
  where.addIf(f.actorId, `al.actor_id = ?`, f.actorId);
  where.addIf(f.outcome, `al.outcome = ?`, f.outcome);
  where.addIf(f.cursor, `al.created_at < ?`, f.cursor);

  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT al.id, al.action, al.resource, al.resource_id, al.ip_address, al.user_agent,
            al.outcome, al.metadata, al.created_at, ${userJoinColumns('u', 'actor')}
       FROM audit_log al LEFT JOIN users u ON u.id = al.actor_id
       ${where.sql}
      ORDER BY al.created_at DESC LIMIT ${f.limit + 1}`,
    where.params,
  );

  const hasMore = rows.length > f.limit;
  const page = hasMore ? rows.slice(0, f.limit) : rows;
  const items = page.map((row) => ({
    id: String(row.id),
    actor: nestedUser(row, 'actor'),
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    outcome: row.outcome,
    metadata: row.metadata,
    createdAt: iso(row.created_at as string),
  }));
  const last = page[page.length - 1];
  return { items, nextCursor: hasMore && last ? iso(last.created_at as string) : null };
}
