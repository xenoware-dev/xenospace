import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type { AppNotification, ListNotificationsResult } from '@/types/notification'

export const notificationApi = {
  list: (params: { page?: number; limit?: number; filter?: 'all' | 'unread' } = {}) =>
    api
      .get<ApiEnvelope<ListNotificationsResult>>('/notifications', { params })
      .then((r) => r.data),

  unreadCount: () =>
    api
      .get<ApiEnvelope<{ unread: number }>>('/notifications/unread-count')
      .then((r) => r.data),

  markRead: (id: string) =>
    api
      .post<ApiEnvelope<{ notification: AppNotification }>>(`/notifications/${id}/read`)
      .then((r) => r.data),

  markAllRead: () =>
    api.post<ApiEnvelope<{ updated: number }>>('/notifications/read-all').then((r) => r.data),

  remove: (id: string) =>
    api.delete<ApiEnvelope<{ deleted: number }>>(`/notifications/${id}`).then((r) => r.data),

  clearRead: () =>
    api.delete<ApiEnvelope<{ deleted: number }>>('/notifications/read').then((r) => r.data),
}
