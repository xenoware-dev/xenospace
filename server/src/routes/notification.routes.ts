import { Router } from 'express'

import * as notificationController from '@/controllers/notification.controller'
import { protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  listNotificationsQuerySchema,
  notificationIdSchema,
} from '@/validators/notification.validator'

const router = Router()

router.use(protect)

// The fixed segments come first, so neither is read as an id by /:id.
router.get('/', validate(listNotificationsQuerySchema), notificationController.listNotifications)
router.get('/unread-count', notificationController.getUnreadCount)

router.post('/read-all', notificationController.markAllNotificationsRead)
router.delete('/read', notificationController.clearReadNotifications)

router.post('/:id/read', validate(notificationIdSchema), notificationController.markNotificationRead)
router.delete('/:id', validate(notificationIdSchema), notificationController.deleteNotification)

export default router
