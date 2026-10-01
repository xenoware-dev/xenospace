import type { Request, Response } from 'express'

import { calendarService } from '@/services/calendar.service'
import type { CalendarEventKind, Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const listCalendarEvents = catchAsync(async (req: Request, res: Response) => {
  // `validate` has already coerced these against the schema — the dates are
  // Dates, the flags are booleans and `kinds` is the parsed list, so nothing
  // here has to re-read them out of strings.
  const query = req.query as unknown as {
    from: Date
    to: Date
    project?: string
    assignee?: string
    mine: boolean
    includeDone: boolean
    kinds: CalendarEventKind[]
  }

  const result = await calendarService.events(
    { ...query },
    { id: String(req.user!._id), role: req.user!.role as Role }
  )

  ApiResponse.send(res, 200, 'Calendar', result)
})

export const getCalendarSummary = catchAsync(async (_req: Request, res: Response) => {
  const summary = await calendarService.summary()
  ApiResponse.send(res, 200, 'Calendar summary', { summary })
})
