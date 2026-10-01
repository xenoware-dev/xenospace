import type { PresenceStatus, Role } from '@/types/auth'
import type { Task } from '@/types/task'

/** The buckets My Work is cut into, in the order they are shown. */
export const WORK_BUCKETS = ['overdue', 'today', 'thisWeek', 'later', 'undated'] as const
export type WorkBucket = (typeof WORK_BUCKETS)[number]

export interface MyWork {
  overdue: Task[]
  today: Task[]
  thisWeek: Task[]
  later: Task[]
  undated: Task[]
  recentlyCompleted: Task[]
  counts: {
    open: number
    overdue: number
    dueToday: number
    completedThisWeek: number
  }
}

export interface WorkloadUser {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  presenceStatus: PresenceStatus
}

export interface WorkloadRow {
  user: WorkloadUser
  open: number
  overdue: number
  dueSoon: number
  completedThisWeek: number
  /** Open work weighted by priority, not a flat card count. */
  load: number
}

export interface Workload {
  rows: WorkloadRow[]
  totals: {
    people: number
    open: number
    overdue: number
    unassigned: number
  }
}
