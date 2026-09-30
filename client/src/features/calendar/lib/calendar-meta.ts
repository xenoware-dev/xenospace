import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarClock, Flag, Rocket, type LucideIcon } from 'lucide-react'

import type { CalendarEvent, CalendarEventKind, CalendarView } from '@/types/calendar'
import type { Project, ProjectPriority } from '@/types/project'
import type { Task } from '@/types/task'

/** Weeks start on Monday, matching how the dashboard buckets its own weeks. */
export const WEEK_OPTIONS = { weekStartsOn: 1 } as const

/** How many days of agenda are fetched and listed at a time. */
export const AGENDA_DAYS = 28

export const weekdayLabels = eachDayOfInterval({
  start: startOfWeek(new Date(), WEEK_OPTIONS),
  end: endOfWeek(new Date(), WEEK_OPTIONS),
}).map((day) => format(day, 'EEE'))

interface KindMeta {
  label: string
  /** Counting forms, for "2 deadlines" / "1 kickoff". */
  noun: string
  nounPlural: string
  icon: LucideIcon
  /** The chip's own colouring, over the glass tile beneath it. */
  chip: string
  /** The leading rule that identifies the layer at a glance. */
  rail: string
  dot: string
}

export const eventKindMeta: Record<CalendarEventKind, KindMeta> = {
  TASK: {
    label: 'Tasks',
    noun: 'task due',
    nounPlural: 'tasks due',
    icon: CalendarClock,
    chip: 'bg-glass-tile text-foreground',
    rail: 'bg-data',
    dot: 'bg-data',
  },
  PROJECT_START: {
    label: 'Kickoffs',
    noun: 'kickoff',
    nounPlural: 'kickoffs',
    icon: Rocket,
    chip: 'bg-success/12 text-foreground',
    rail: 'bg-success',
    dot: 'bg-success',
  },
  PROJECT_DUE: {
    label: 'Deadlines',
    noun: 'deadline',
    nounPlural: 'deadlines',
    icon: Flag,
    chip: 'bg-warning/16 text-foreground',
    rail: 'bg-warning',
    dot: 'bg-warning',
  },
}

/** Priority only tints a chip when it is worth interrupting someone over. */
export const priorityAccent: Partial<Record<ProjectPriority, string>> = {
  HIGH: 'text-warning',
  URGENT: 'text-destructive',
}

export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd')

export const isToday = (date: Date) => isSameDay(date, new Date())

/** The inverse of `dayKey`, read as a local date rather than a UTC instant. */
export const dayFromKey = (key: string) => parse(key, 'yyyy-MM-dd', new Date())

export const isWeekend = (date: Date) => {
  const weekday = date.getDay()
  return weekday === 0 || weekday === 6
}

export { isSameMonth }

/**
 * The six-week block a month is drawn on: whole weeks, so every row has seven
 * cells and the grid never reflows as the month changes length.
 */
export function monthGrid(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), WEEK_OPTIONS),
    end: endOfWeek(endOfMonth(month), WEEK_OPTIONS),
  })
}

export function weekGrid(anchor: Date) {
  const start = startOfWeek(anchor, WEEK_OPTIONS)
  return eachDayOfInterval({ start, end: addDays(start, 6) })
}

/** The window each view needs fetched: inclusive start, exclusive end. */
export function visibleRange(view: CalendarView, cursor: Date) {
  if (view === 'month') {
    const days = monthGrid(cursor)
    return { from: days[0], to: addDays(days[days.length - 1], 1) }
  }
  if (view === 'week') {
    const start = startOfWeek(cursor, WEEK_OPTIONS)
    return { from: start, to: addDays(start, 7) }
  }
  const start = startOfDay(cursor)
  return { from: start, to: addDays(start, AGENDA_DAYS) }
}

/** The label above the grid: "September 2026", or the week's span. */
export function rangeLabel(view: CalendarView, cursor: Date) {
  if (view === 'month') return format(cursor, 'MMMM yyyy')

  const { from, to } = visibleRange(view, cursor)
  const last = addDays(to, -1)
  const sameMonth = isSameMonth(from, last)

  return sameMonth
    ? `${format(from, 'd')} – ${format(last, 'd MMM yyyy')}`
    : `${format(from, 'd MMM')} – ${format(last, 'd MMM yyyy')}`
}

/** Moves the cursor one screenful in either direction. */
export function shiftCursor(view: CalendarView, cursor: Date, direction: 1 | -1) {
  if (view === 'month') {
    // Anchored to the first of the month so a 31st never skips a short month.
    const next = startOfMonth(cursor)
    next.setMonth(next.getMonth() + direction)
    return next
  }
  return addDays(cursor, direction * (view === 'week' ? 7 : AGENDA_DAYS))
}

/**
 * Events keyed by the local day they fall on. Bucketing is local rather than
 * UTC so a card shows up on the day its own due date reads as.
 */
export function groupByDay(events: CalendarEvent[]) {
  const grouped: Record<string, CalendarEvent[]> = {}
  events.forEach((event) => {
    const key = dayKey(parseISO(event.date))
    ;(grouped[key] ??= []).push(event)
  })
  return grouped
}

const KIND_ORDER: Record<CalendarEventKind, number> = {
  PROJECT_START: 0,
  PROJECT_DUE: 1,
  TASK: 2,
}

const PRIORITY_ORDER: Record<ProjectPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

/** Milestones first, then the most urgent cards — what a day cell should show. */
export function sortEvents(events: CalendarEvent[]) {
  return [...events].sort(
    (a, b) =>
      Number(a.isDone) - Number(b.isDone) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.title.localeCompare(b.title)
  )
}

/**
 * An undated card wears the same chip as anything else on the grid, so the tray
 * lends it the event shape rather than the chip learning a second one.
 */
export function taskAsEvent(task: Task): CalendarEvent {
  return {
    id: `TASK:${task.id}`,
    kind: 'TASK',
    sourceId: task.id,
    title: task.title,
    date: task.dueDate ?? '',
    isDone: task.isDone,
    priority: task.priority,
    reference: task.reference,
    project: task.project,
    owner: task.assignee,
    status: null,
    progress: null,
  }
}

/**
 * The milestone events a project contributes, so a project that has just been
 * rescheduled can be folded back into the stream without another fetch.
 */
export function projectAsEvents(project: Project): CalendarEvent[] {
  const base = {
    sourceId: project.id,
    title: project.name,
    isDone: project.status === 'COMPLETED' || project.status === 'ARCHIVED',
    priority: project.priority,
    reference: project.key,
    project: { id: project.id, name: project.name, key: project.key },
    owner: project.lead,
    status: project.status,
    progress: project.progress,
  }

  return [
    ...(project.startDate
      ? [
          {
            ...base,
            id: `PROJECT_START:${project.id}`,
            kind: 'PROJECT_START' as const,
            date: project.startDate,
          },
        ]
      : []),
    ...(project.dueDate
      ? [
          {
            ...base,
            id: `PROJECT_DUE:${project.id}`,
            kind: 'PROJECT_DUE' as const,
            date: project.dueDate,
          },
        ]
      : []),
  ]
}

/** Which date field on a project a given milestone chip stands for. */
export const projectDateField = (kind: CalendarEventKind) =>
  kind === 'PROJECT_START' ? ('startDate' as const) : ('dueDate' as const)

/** Where an event's chip links to, and which record a drop has to rewrite. */
export function eventHref(event: CalendarEvent) {
  return event.kind === 'TASK' ? '/tasks' : `/projects/${event.sourceId}`
}

/**
 * Local midnight for a grid cell. Sending the day's own midnight — rather than
 * the UTC midnight `new Date('yyyy-MM-dd')` parses to — keeps a card on the cell
 * it was dropped on in every timezone.
 */
export function dayToIso(date: Date) {
  return startOfDay(date).toISOString()
}

export function eventTimeLabel(event: CalendarEvent) {
  return event.date ? format(parseISO(event.date), 'd MMM') : null
}
