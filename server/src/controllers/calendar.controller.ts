import type { Request, Response } from 'express'

import { calendarService } from '@/services/calendar.service'
import type { CalendarEventKind, Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const listCalendarEvents = catchAsync(async (req: Request, res: Response) => {
  // The validate middleware only writes its parsed output back onto req.body, so
  // query values still arrive as strings here and are coerced by hand.
  const query = req.query as Record<string, string | undefined>

  const kinds = (query.kinds?.split(',').map((kind) => kind.trim()).filter(Boolean) ?? [
    'TASK',
    'PROJECT_START',
    'PROJECT_DUE',
  ]) as CalendarEventKind[]

  const result = await calendarService.events(
    {
      from: new Date(String(query.from)),
      to: new Date(String(query.to)),
      project: query.project,
      assignee: query.assignee,
      mine: query.mine === 'true',
      includeDone: query.includeDone === 'true',
      kinds,
    },
    { id: String(req.user!._id), role: req.user!.role as Role }
  )

  ApiResponse.send(res, 200, 'Calendar', result)
})

export const getCalendarSummary = catchAsync(async (_req: Request, res: Response) => {
  const summary = await calendarService.summary()
  ApiResponse.send(res, 200, 'Calendar summary', { summary })
})
