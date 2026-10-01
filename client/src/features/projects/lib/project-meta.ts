import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import type { ProjectPriority, ProjectStatus } from '@/types/project'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

export const statusMeta: Record<ProjectStatus, { label: string; variant: BadgeVariant }> = {
  PLANNING: { label: 'Planning', variant: 'secondary' },
  ACTIVE: { label: 'Active', variant: 'success' },
  ON_HOLD: { label: 'On hold', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'default' },
  ARCHIVED: { label: 'Archived', variant: 'outline' },
}

export const priorityMeta: Record<ProjectPriority, { label: string; variant: BadgeVariant }> = {
  LOW: { label: 'Low', variant: 'outline' },
  MEDIUM: { label: 'Medium', variant: 'secondary' },
  HIGH: { label: 'High', variant: 'warning' },
  URGENT: { label: 'Urgent', variant: 'destructive' },
}

export const sortLabels = {
  recent: 'Recently updated',
  name: 'Name',
  dueDate: 'Due date',
  progress: 'Progress',
} as const

export function formatDate(value: string | null) {
  if (!value) return null
  return format(parseISO(value), 'd MMM yyyy')
}

/** A due date read in human terms: "Due in 5 days", "Overdue by 2 days". */
export function dueLabel(dueDate: string | null, status: ProjectStatus) {
  if (!dueDate) return null

  const days = differenceInCalendarDays(parseISO(dueDate), new Date())
  const settled = status === 'COMPLETED' || status === 'ARCHIVED'

  if (settled) return `Due ${formatDate(dueDate)}`
  if (days < 0) {
    const overdue = Math.abs(days)
    return `Overdue by ${overdue} ${overdue === 1 ? 'day' : 'days'}`
  }
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export function isOverdue(dueDate: string | null, status: ProjectStatus) {
  if (!dueDate || status === 'COMPLETED' || status === 'ARCHIVED') return false
  return differenceInCalendarDays(parseISO(dueDate), new Date()) < 0
}

/** Date inputs need `yyyy-MM-dd`; the API returns full ISO timestamps. */
export function toDateInput(value: string | null) {
  return value ? format(parseISO(value), 'yyyy-MM-dd') : ''
}
