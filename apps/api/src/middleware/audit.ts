import type { Request } from 'express';
import type { Queryable } from '../db/index.js';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { clientIp } from './rateLimit.js';

/**
 * Security audit trail.
 *
 * Distinct from the product activity feed: this records who attempted what and
 * whether it was allowed, including denials. Writes are fire-and-forget — an
 * audit failure must never fail the user's request — but they are awaited
 * inside transactions where the audit row should roll back with the change.
 */

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  resource?: string | null;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export async function writeAudit(entry: AuditEntry, tx?: Queryable): Promise<void> {
  const runner = tx ?? db();
  await runner.query(
    `INSERT INTO audit_log (actor_id, action, resource, resource_id, ip_address, user_agent, outcome, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.actorId ?? null,
      entry.action,
      entry.resource ?? null,
      entry.resourceId ?? null,
      entry.ip ?? null,
      entry.userAgent?.slice(0, 500) ?? null,
      entry.outcome ?? 'SUCCESS',
      JSON.stringify(entry.metadata ?? {}),
    ],
  );
}

/** Records an audit entry without blocking the response. */
export function audit(entry: AuditEntry): void {
  void writeAudit(entry).catch((err) => logger.error({ err, action: entry.action }, 'failed to write audit entry'));
}

/** Fills actor, IP and user agent from the request. */
export function auditFromRequest(
  req: Request,
  entry: Omit<AuditEntry, 'actorId' | 'ip' | 'userAgent'>,
): void {
  audit({
    ...entry,
    actorId: req.user?.id ?? null,
    ip: clientIp(req),
    userAgent: req.get('user-agent') ?? null,
  });
}

/* ------------------------------------------------------- product activity */

export interface ActivityEntryInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends to the user-visible activity feed. Takes an optional transaction so
 * the entry commits atomically with the change it describes.
 */
export async function recordActivity(entry: ActivityEntryInput, tx?: Queryable): Promise<string | null> {
  const runner = tx ?? db();
  const { rows } = await runner.query<{ id: string }>(
    `INSERT INTO activity_log (actor_id, action, entity_type, entity_id, entity_label, project_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      entry.actorId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.entityLabel ?? null,
      entry.projectId ?? null,
      JSON.stringify(entry.metadata ?? {}),
    ],
  );
  return rows[0]?.id ?? null;
}
