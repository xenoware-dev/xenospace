import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import type { TaskPriority } from '@/types/task'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

export const taskPriorityMeta: Record<TaskPriority, { label: string; variant: BadgeVariant }> = {
  LOW: { label: 'Low', variant: 'outline' },
  MEDIUM: { label: 'Medium', variant: 'secondary' },
  HIGH: { label: 'High', variant: 'warning' },
  URGENT: { label: 'Urgent', variant: 'destructive' },
}

export const taskSortLabels = {
  board: 'Board order',
  recent: 'Recently updated',
  created: 'Newest first',
  dueDate: 'Due date',
  priority: 'Priority',
  title: 'Title',
} as const

export const dueFilterLabels = {
  overdue: 'Overdue',
  today: 'Due today',
  week: 'Due this week',
  none: 'No due date',
} as const

export function formatTaskDate(value: string | null) {
  if (!value) return null
  return format(parseISO(value), 'd MMM')
}

/** A due date in human terms, kept short enough for a task row. */
export function taskDueLabel(dueDate: string | null, isDone: boolean) {
  if (!dueDate) return null
  if (isDone) return formatTaskDate(dueDate)

  const days = differenceInCalendarDays(parseISO(dueDate), new Date())
  if (days < 0) {
    const overdue = Math.abs(days)
    return `${overdue}d overdue`
  }
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return `In ${days}d`
  return formatTaskDate(dueDate)
}

export function isTaskOverdue(dueDate: string | null, isDone: boolean) {
  if (!dueDate || isDone) return false
  return differenceInCalendarDays(parseISO(dueDate), new Date()) < 0
}

/** Date inputs need `yyyy-MM-dd`; the API returns full ISO timestamps. */
export function toDateInput(value: string | null) {
  return value ? format(parseISO(value), 'yyyy-MM-dd') : ''
}
