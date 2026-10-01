import type { Role } from '@/types/auth'
import type { ProjectStatus } from '@/types/project'

export interface RoleCount {
  role: Role
  count: number
}

export interface DepartmentCount {
  id: string
  name: string
  memberCount: number
}

export interface ProjectStatusCount {
  status: ProjectStatus
  count: number
}

export interface NewestMember {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  isEmailVerified: boolean
  joinedAt: string
  isNewThisWeek: boolean
}

export interface AdminOverview {
  members: {
    total: number
    active: number
    deactivated: number
    pendingVerification: number
    online: number
    newThisWeek: number
    /** This week against last week; null when last week had no signups. */
    deltaPercent: number | null
    /** Twelve weekly buckets, oldest first. */
    signupsTrend: number[]
  }
  /** Every role, in privilege order, including the ones nobody holds. */
  roles: RoleCount[]
  departments: {
    total: number
    unassignedMembers: number
    rows: DepartmentCount[]
  }
  projects: {
    total: number
    active: number
    byStatus: ProjectStatusCount[]
  }
  tasks: {
    total: number
    open: number
    done: number
    overdue: number
  }
  storage: {
    files: number
    totalSize: number
  }
  newestMembers: NewestMember[]
}
