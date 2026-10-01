import type { QueryFilter } from 'mongoose'

import { AuditLog, type IAuditLog } from '@/models/AuditLog.model'
import type { IUser } from '@/models/User.model'
import { AUDIT_ACTION_SEVERITY, type AuditAction, type AuditEntity } from '@/types/enums'

interface RecordInput {
  actor: IUser
  action: AuditAction
  entity: AuditEntity
  entityId?: string | null
  entityLabel: string
  summary: string
  before?: string | null
  after?: string | null
  ip?: string | null
}

/**
 * Writes one entry. Auditing is a side effect of the act being audited, never a
 * precondition for it: a log failure must not roll back a role change that has
 * already been saved, so this swallows its own errors and only reports them to
 * the server console. The caller therefore does not need to await it, though
 * awaiting is harmless.
 */
async function record(input: RecordInput) {
  try {
    await AuditLog.create({
      actor: input.actor._id,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      entityLabel: input.entityLabel,
      summary: input.summary,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
    })
  } catch (error) {
    console.error('Audit log write failed:', error)
  }
}

interface ListInput {
  page: number
  limit: number
  action?: AuditAction
  actor?: string
  search?: string
}

function serialize(entry: IAuditLog) {
  return {
    id: String(entry._id),
    actorId: entry.actor ? String(entry.actor) : null,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    action: entry.action,
    severity: AUDIT_ACTION_SEVERITY[entry.action],
    entity: entry.entity,
    entityId: entry.entityId ? String(entry.entityId) : null,
    entityLabel: entry.entityLabel,
    summary: entry.summary,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
    createdAt: entry.createdAt,
  }
}

async function list(input: ListInput) {
  const filter: QueryFilter<IAuditLog> = {}

  if (input.action) filter.action = input.action
  if (input.actor) filter.actor = input.actor
  if (input.search) {
    const regex = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ summary: regex }, { actorName: regex }, { entityLabel: regex }]
  }

  const skip = (input.page - 1) * input.limit

  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit),
    AuditLog.countDocuments(filter),
  ])

  return {
    entries: entries.map(serialize),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

/**
 * Counts per action across the whole log, for the summary strip above the list.
 * Unfiltered on purpose — the strip describes the log, not the current filter.
 */
async function summary() {
  const [rows, actors, oldest] = await Promise.all([
    AuditLog.aggregate<{ _id: AuditAction; count: number }>([
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]),
    AuditLog.distinct('actor'),
    AuditLog.findOne().sort({ createdAt: 1 }).select('createdAt'),
  ])

  const byAction = new Map(rows.map((row) => [row._id, row.count]))

  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    alerts: rows
      .filter((row) => AUDIT_ACTION_SEVERITY[row._id] === 'ALERT')
      .reduce((sum, row) => sum + row.count, 0),
    distinctActors: actors.filter(Boolean).length,
    oldestEntryAt: oldest?.createdAt ?? null,
    byAction: Object.fromEntries(byAction) as Partial<Record<AuditAction, number>>,
  }
}

/** The actors who appear in the log, for the "who" filter. */
async function actors() {
  const rows = await AuditLog.aggregate<{ _id: unknown; name: string; count: number }>([
    { $match: { actor: { $ne: null } } },
    {
      $group: {
        _id: '$actor',
        name: { $last: '$actorName' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 50 },
  ])

  return rows.map((row) => ({ id: String(row._id), name: row.name, count: row.count }))
}

export const auditService = { record, list, summary, actors }
