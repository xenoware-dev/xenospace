import type { QueryFilter } from 'mongoose'

import { Notification, type INotification } from '@/models/Notification.model'
import { emitToUser } from '@/sockets/index'
import type { NotificationEntity, NotificationType } from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { serializeNotification, type SafeNotification } from '@/utils/serialize-notification'

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

interface NotifyInput {
  recipient: string
  /** Omitted when the system raised it rather than a person. */
  actor?: string | null
  type: NotificationType
  message: string
  entity: NotificationEntity
  entityId: string
  url: string
}

/**
 * Writes one notification and pushes it live.
 *
 * Nothing here throws. Notifying is always a side effect of some other action
 * — assigning a task, adding someone to a project — and a failed nudge must
 * never roll back the thing the person actually asked for. Failures are
 * logged and swallowed.
 */
async function notify(input: NotifyInput): Promise<SafeNotification | null> {
  // Nobody needs telling about something they did to themselves.
  if (input.actor && input.actor === input.recipient) return null

  try {
    const notification = await Notification.create({
      recipient: input.recipient,
      actor: input.actor ?? null,
      type: input.type,
      message: input.message,
      entity: input.entity,
      entityId: input.entityId,
      url: input.url,
    })

    await notification.populate({ path: 'actor', select: USER_REF_FIELDS })
    const safe = serializeNotification(notification)

    emitToUser(input.recipient, 'notification:new', safe)
    void publishUnreadCount(input.recipient)

    return safe
  } catch (error) {
    console.error('Failed to write notification:', error)
    return null
  }
}

/** Several at once — adding a handful of people to a project, say. */
async function notifyMany(recipients: string[], input: Omit<NotifyInput, 'recipient'>) {
  const unique = [...new Set(recipients)].filter((id) => id !== input.actor)
  await Promise.all(unique.map((recipient) => notify({ ...input, recipient })))
}

/** Keeps the badge honest without the client having to ask again. */
async function publishUnreadCount(userId: string) {
  try {
    const unread = await Notification.countDocuments({ recipient: userId, readAt: null })
    emitToUser(userId, 'notification:count', { unread })
  } catch {
    // The badge catches up on the next page load; nothing to do here.
  }
}

interface ListInput {
  page: number
  limit: number
  /** `unread` is the bell's dropdown; `all` is the full page. */
  filter: 'all' | 'unread'
}

async function list(input: ListInput, userId: string) {
  const filter: QueryFilter<INotification> = { recipient: userId }
  if (input.filter === 'unread') filter.readAt = null

  const skip = (input.page - 1) * input.limit

  const [notifications, total, unread] = await Promise.all([
    Notification.find(filter)
      .populate({ path: 'actor', select: USER_REF_FIELDS })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(input.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: userId, readAt: null }),
  ])

  return {
    items: notifications.map(serializeNotification),
    unread,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

async function unreadCount(userId: string) {
  return { unread: await Notification.countDocuments({ recipient: userId, readAt: null }) }
}

async function markRead(id: string, userId: string) {
  // Scoped to the recipient, so an id from somewhere else matches nothing
  // rather than reading someone else's mail.
  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipient: userId },
    { readAt: new Date() },
    { returnDocument: 'after' }
  ).populate({ path: 'actor', select: USER_REF_FIELDS })

  if (!notification) {
    throw ApiError.notFound('That notification no longer exists')
  }

  void publishUnreadCount(userId)
  return serializeNotification(notification)
}

async function markAllRead(userId: string) {
  const result = await Notification.updateMany(
    { recipient: userId, readAt: null },
    { readAt: new Date() }
  )

  void publishUnreadCount(userId)
  return { updated: result.modifiedCount }
}

async function remove(id: string, userId: string) {
  const result = await Notification.deleteOne({ _id: id, recipient: userId })
  if (!result.deletedCount) {
    throw ApiError.notFound('That notification no longer exists')
  }

  void publishUnreadCount(userId)
  return { deleted: 1 }
}

async function clearRead(userId: string) {
  const result = await Notification.deleteMany({ recipient: userId, readAt: { $ne: null } })
  return { deleted: result.deletedCount }
}

export const notificationService = {
  notify,
  notifyMany,
  list,
  unreadCount,
  markRead,
  markAllRead,
  remove,
  clearRead,
}
