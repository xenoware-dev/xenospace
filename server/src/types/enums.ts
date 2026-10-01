// Central place for RBAC roles and other shared enums.
// Roles are ordered from highest to lowest privilege.
export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'TEAM_LEAD',
  'DEVELOPER',
  'DESIGNER',
  'MARKETING',
  'INTERN',
  'MEMBER',
] as const

export type Role = (typeof ROLES)[number]

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

export const PRESENCE_STATUSES = ['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'] as const
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number]

// Projects move through these states; ARCHIVED is hidden from the default list.
export const PROJECT_STATUSES = [
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number]

/** Roles that may create a project and manage any project they do not lead. */
export const PROJECT_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

/** Seeded onto a brand new board so it is usable straight away. */
export const DEFAULT_TASK_LISTS = [
  { name: 'To do', isDone: false },
  { name: 'In progress', isDone: false },
  { name: 'In review', isDone: false },
  { name: 'Done', isDone: true },
]

/** Tasks and projects share one priority vocabulary. */
export const TASK_PRIORITIES = PROJECT_PRIORITIES
export type TaskPriority = ProjectPriority

/** Sortable weights, so "most urgent first" is a plain index sort in Mongo. */
export const TASK_PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

/**
 * What the calendar draws. A project contributes up to two events — its kickoff
 * and its deadline — so the kind, not the row, is what identifies an event.
 */
export const CALENDAR_EVENT_KINDS = ['TASK', 'PROJECT_START', 'PROJECT_DUE'] as const
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number]

/** Statuses that take a project off the "still running" reckoning. */
export const SETTLED_PROJECT_STATUSES: ProjectStatus[] = ['COMPLETED', 'ARCHIVED']
