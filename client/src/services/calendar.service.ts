import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type { CalendarEvent, CalendarSummary, ListCalendarParams } from '@/types/calendar'

export const calendarApi = {
  /** Task due dates and project milestones for one window, already in order. */
  events: (params: ListCalendarParams) =>
    api
      .get<ApiEnvelope<{ events: CalendarEvent[] }>>('/calendar', { params })
      .then((r) => r.data),

  summary: () =>
    api.get<ApiEnvelope<{ summary: CalendarSummary }>>('/calendar/summary').then((r) => r.data),
}
