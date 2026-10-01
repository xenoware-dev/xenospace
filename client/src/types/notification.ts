import type { PresenceStatus, Role } from '@/types/auth'
import type { Pagination } from '@/types/team'

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'PROJECT_MEMBER_ADDED',
  'PROJECT_MEMBER_REMOVED',
  'ARTICLE_COMMENTED',
  'ARTICLE_MENTIONED',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export type NotificationEntity = 'TASK' | 'PROJECT' | 'ARTICLE'

export interface NotificationActor {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  presenceStatus: PresenceStatus
}

export interface AppNotification {
  id: string
  /** Null when the system raised it rather than a person. */
  actor: NotificationActor | null
  type: NotificationType
  /** The verb phrase; the actor's name is drawn in front of it. */
  message: string
  entity: NotificationEntity
  entityId: string
  url: string
  isRead: boolean
  readAt: string | null
  createdAt: string
}

export interface ListNotificationsResult {
  items: AppNotification[]
  unread: number
  pagination: Pagination
}
