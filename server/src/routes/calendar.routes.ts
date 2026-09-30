import { Router } from 'express'

import * as calendarController from '@/controllers/calendar.controller'
import { protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import { listCalendarQuerySchema } from '@/validators/calendar.validator'

const router = Router()

router.use(protect)

// Read-only: rescheduling goes through the task and project endpoints, so the
// permission rules for changing a card live in one place.
router.get('/', validate(listCalendarQuerySchema), calendarController.listCalendarEvents)
router.get('/summary', calendarController.getCalendarSummary)

export default router
