import type { HydratedDocument } from 'mongoose'

import type { INotification } from '@/models/Notification.model'
import { toUserRef, type UserRef } from '@/utils/refs'

export interface SafeNotification {
  id: string
  /** Null when the system raised it rather than a person. */
  actor: UserRef | null
  type: string
  message: string
  entity: string
  entityId: string
  url: string
  isRead: boolean
  readAt: Date | null
  createdAt: Date
}

export function serializeNotification(
  notification: HydratedDocument<INotification>
): SafeNotification {
  return {
    id: String(notification._id),
    actor: toUserRef(notification.actor),
    type: notification.type,
    message: notification.message,
    entity: notification.entity,
    entityId: String(notification.entityId),
    url: notification.url,
    isRead: !!notification.readAt,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  }
}
