import type { Request, Response } from 'express'

import { notificationService } from '@/services/notification.service'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

function viewerOf(req: Request) {
  return String(req.user!._id)
}

export const listNotifications = catchAsync(async (req: Request, res: Response) => {
  // validate() writes its parsed output back onto req.body only, so query
  // values still arrive as strings here and are coerced by hand.
  const query = req.query as Record<string, string | undefined>

  const result = await notificationService.list(
    {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
      filter: query.filter === 'unread' ? 'unread' : 'all',
    },
    viewerOf(req)
  )

  ApiResponse.send(res, 200, 'Notifications', result)
})

export const getUnreadCount = catchAsync(async (req: Request, res: Response) => {
  const result = await notificationService.unreadCount(viewerOf(req))
  ApiResponse.send(res, 200, 'Unread count', result)
})

export const markNotificationRead = catchAsync(async (req: Request, res: Response) => {
  const notification = await notificationService.markRead(String(req.params.id), viewerOf(req))
  ApiResponse.send(res, 200, 'Marked as read', { notification })
})

export const markAllNotificationsRead = catchAsync(async (req: Request, res: Response) => {
  const result = await notificationService.markAllRead(viewerOf(req))
  ApiResponse.send(res, 200, 'All caught up', result)
})

export const deleteNotification = catchAsync(async (req: Request, res: Response) => {
  const result = await notificationService.remove(String(req.params.id), viewerOf(req))
  ApiResponse.send(res, 200, 'Notification removed', result)
})

export const clearReadNotifications = catchAsync(async (req: Request, res: Response) => {
  const result = await notificationService.clearRead(viewerOf(req))
  ApiResponse.send(res, 200, 'Cleared', result)
})
