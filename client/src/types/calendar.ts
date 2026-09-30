import type { ProjectPriority, ProjectStatus } from '@/types/project'
import type { TaskProjectRef, TaskUserRef } from '@/types/task'

/**
 * A project contributes up to two events — its kickoff and its deadline — so an
 * event is identified by its kind together with the row it came from.
 */
export const CALENDAR_EVENT_KINDS = ['TASK', 'PROJECT_START', 'PROJECT_DUE'] as const
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number]

export const CALENDAR_VIEWS = ['month', 'week', 'agenda'] as const
export type CalendarView = (typeof CALENDAR_VIEWS)[number]

export interface CalendarEvent {
  /** `KIND:rowId` — unique per event rather than per row. */
  id: string
  kind: CalendarEventKind
  /** The task or project this event points back at. */
  sourceId: string
  title: string
  date: string
  /** A completed card, or a project that has been closed out. */
  isDone: boolean
  priority: ProjectPriority
  reference: string | null
  /** The project the event belongs to — for a project event, itself. */
  project: TaskProjectRef | null
  /** The task's assignee, or the project's lead. */
  owner: TaskUserRef | null
  /** Project events only. */
  status: ProjectStatus | null
  progress: number | null
}

export interface CalendarSummary {
  overdue: number
  dueToday: number
  dueThisWeek: number
  /** Open cards carrying no due date — what the unscheduled tray holds. */
  unscheduled: number
  projectsDueThisWeek: number
}

export interface ListCalendarParams {
  /** Inclusive start and exclusive end of the window on screen, as ISO strings. */
  from: string
  to: string
  project?: string
  assignee?: string
  mine?: boolean
  includeDone?: boolean
  /** Comma-separated kinds; left out, every layer comes back. */
  kinds?: string
}
