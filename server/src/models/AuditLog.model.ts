import { Schema, model, type Document, type Types } from 'mongoose'

import { AUDIT_ACTIONS, AUDIT_ENTITIES, AUDIT_RETENTION_DAYS, type AuditAction, type AuditEntity } from '@/types/enums'

export interface IAuditLog extends Document {
  _id: Types.ObjectId
  /** Who did it. Null once that account is deleted — the entry outlives them. */
  actor?: Types.ObjectId | null
  /**
   * The actor's name and role as they were at the time. An entry is a record of
   * a moment: if someone is later demoted, the log must still say they were an
   * admin when they made the change, so this is written rather than joined.
   */
  actorName: string
  actorRole: string
  action: AuditAction
  entity: AuditEntity
  entityId?: Types.ObjectId | null
  /** What the entry is about, named at write time for the same reason. */
  entityLabel: string
  /** The one-line sentence shown in the log, composed when it happened. */
  summary: string
  /** Before/after for a change that has them, e.g. a role swap. */
  before?: string | null
  after?: string | null
  ip?: string | null
  createdAt: Date
  updatedAt: Date
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    entity: { type: String, enum: AUDIT_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    entityLabel: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 300 },
    before: { type: String, default: null },
    after: { type: String, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: true }
)

// The two filters the console offers, each narrowed then sorted.
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ actor: 1, createdAt: -1 })

// Mongo expires old entries itself, so nothing has to run a cron for it. This
// also serves the unfiltered "newest first" read, since a single-field index is
// walked in either direction — no separate { createdAt: -1 } is needed.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 60 * 60 })

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema)
