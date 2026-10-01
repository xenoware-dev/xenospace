import { Schema, model, type Document, type Types } from 'mongoose'

import {
  NOTIFICATION_ENTITIES,
  NOTIFICATION_RETENTION_DAYS,
  NOTIFICATION_TYPES,
  type NotificationEntity,
  type NotificationType,
} from '@/types/enums'

export interface INotification extends Document {
  _id: Types.ObjectId
  /** Who this is for. Every notification belongs to exactly one person. */
  recipient: Types.ObjectId
  /** Who caused it. Null when the system raised it, such as a due-date nudge. */
  actor?: Types.ObjectId | null
  type: NotificationType
  /**
   * The sentence shown in the list, composed when the event happened rather
   * than at read time. An assignment that read "Priya assigned you XENO-12"
   * should keep saying that after the task is renamed or reassigned — the
   * notification is a record of a moment, not a live view of the task.
   */
  message: string
  entity: NotificationEntity
  entityId: Types.ObjectId
  /** Where clicking it goes, resolved at write time for the same reason. */
  url: string
  readAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    message: { type: String, required: true, maxlength: 300 },
    entity: { type: String, enum: NOTIFICATION_ENTITIES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    url: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// The inbox: one person's notifications, newest first.
notificationSchema.index({ recipient: 1, createdAt: -1 })
// The unread badge, which is read on every page load.
notificationSchema.index({ recipient: 1, readAt: 1 })
// Stops a duplicate nudge for the same task on the same day.
notificationSchema.index({ recipient: 1, type: 1, entityId: 1, createdAt: -1 })

// Mongo sweeps read notifications itself, so nothing has to run a cron for it.
// Only `readAt` carries the expiry, so anything still unread is kept.
notificationSchema.index(
  { readAt: 1 },
  { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 }
)

export const Notification = model<INotification>('Notification', notificationSchema)
