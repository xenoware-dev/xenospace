import type { PresenceStatus, Role } from '@/types/auth'
import type { Pagination } from '@/types/team'
import type { ProjectPriority } from '@/types/project'

/** Tasks and projects share one priority vocabulary. */
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type TaskPriority = ProjectPriority

export const TASK_SORTS = ['board', 'recent', 'created', 'dueDate', 'priority', 'title'] as const
export type TaskSort = (typeof TASK_SORTS)[number]

export type DueFilter = 'overdue' | 'today' | 'week'

export interface TaskUserRef {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  presenceStatus: PresenceStatus
}

export interface TaskProjectRef {
  id: string
  name: string
  key: string
}

export interface TaskListRef {
  id: string
  name: string
  isDone: boolean
}

/** A board column. */
export interface TaskList {
  id: string
  name: string
  position: number
  isDone: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  description: string
  reference: string | null
  listId: string
  list: TaskListRef | null
  position: number
  isDone: boolean
  project: TaskProjectRef | null
  assignee: TaskUserRef | null
  createdBy: TaskUserRef | null
  priority: TaskPriority
  dueDate: string | null
  tags: string[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskSummary {
  total: number
  done: number
  open: number
  overdue: number
  dueToday: number
  mineOpen: number
}

export interface ListTasksParams {
  page?: number
  limit?: number
  search?: string
  list?: string
  priority?: TaskPriority
  /** An id, or "none" for tasks with no project. */
  project?: string
  /** An id, or "none" for unassigned tasks. */
  assignee?: string
  creator?: string
  mine?: boolean
  due?: DueFilter
  includeDone?: boolean
  sort?: TaskSort
}

export interface TaskPayload {
  title: string
  description?: string
  list?: string
  project?: string | null
  assignee?: string | null
  priority?: TaskPriority
  dueDate?: string | null
  tags?: string[]
}

export type { Pagination }
