import type { PresenceStatus, Role } from '@/types/auth'
import type { Pagination } from '@/types/team'

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

/** Roles allowed to create projects and manage ones they do not lead. */
export const PROJECT_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

export const PROJECT_SORTS = ['recent', 'name', 'dueDate', 'progress'] as const
export type ProjectSort = (typeof PROJECT_SORTS)[number]

export interface ProjectUserRef {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  presenceStatus: PresenceStatus
}

export interface ProjectDepartmentRef {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  key: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  lead: ProjectUserRef | null
  members: ProjectUserRef[]
  department: ProjectDepartmentRef | null
  tags: string[]
  startDate: string | null
  dueDate: string | null
  progress: number
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface ProjectSummary {
  total: number
  active: number
  planning: number
  onHold: number
  completed: number
  archived: number
  overdue: number
  mine: number
}

export interface ListProjectsParams {
  page?: number
  limit?: number
  search?: string
  status?: ProjectStatus
  priority?: ProjectPriority
  department?: string
  lead?: string
  member?: string
  mine?: boolean
  sort?: ProjectSort
  includeArchived?: boolean
}

export interface ProjectPayload {
  name: string
  key?: string
  description?: string
  status?: ProjectStatus
  priority?: ProjectPriority
  lead?: string
  members?: string[]
  department?: string | null
  tags?: string[]
  startDate?: string | null
  dueDate?: string | null
  progress?: number
}

export type { Pagination }
