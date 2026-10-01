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

/** One gate in the API, named once on the server so the matrix cannot drift. */
export interface Capability {
  key: string
  label: string
  description: string
}

export interface RoleSummary {
  role: Role
  count: number
  active: number
  isAdmin: boolean
  /** Share of the whole membership, to one decimal. */
  share: number
  /** The `Capability.key`s this role holds. */
  capabilities: string[]
}

export interface AdminRoles {
  total: number
  capabilities: Capability[]
  /** Every role in privilege order, including the ones nobody holds. */
  roles: RoleSummary[]
  lastRoleChange: { summary: string; at: string } | null
}

export const AUDIT_ACTIONS = [
  'USER_ROLE_CHANGED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'USER_REGISTERED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'DEPARTMENT_DELETED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditSeverity = 'INFO' | 'NOTICE' | 'ALERT'

export interface AuditEntry {
  id: string
  actorId: string | null
  actorName: string
  /** The actor's role *at the time*, which may no longer be their role. */
  actorRole: Role
  action: AuditAction
  severity: AuditSeverity
  entity: 'USER' | 'DEPARTMENT'
  entityId: string | null
  entityLabel: string
  summary: string
  before: string | null
  after: string | null
  ip: string | null
  createdAt: string
}

export interface AuditSummary {
  total: number
  alerts: number
  distinctActors: number
  oldestEntryAt: string | null
  byAction: Partial<Record<AuditAction, number>>
}

export interface AuditLogPage {
  entries: AuditEntry[]
  pagination: { page: number; limit: number; total: number; pages: number }
  summary: AuditSummary
  actors: { id: string; name: string; count: number }[]
}

export interface SystemService {
  key: string
  label: string
  detail: string
  configured: boolean
}

export interface AdminSystem {
  runtime: {
    nodeVersion: string
    platform: string
    environment: string
    uptimeSeconds: number
    startedAt: string
    pid: number
    heapUsed: number
    heapTotal: number
    rss: number
  }
  database: {
    status: string
    host: string | null
    name: string | null
    collections: number
    documents: {
      users: number
      projects: number
      tasks: number
      files: number
      departments: number
      auditEntries: number
    }
  }
  storage: {
    root: string
    files: number
    totalSize: number
    trashedFiles: number
    trashedSize: number
    maxUploadBytes: number
    maxFilesPerRequest: number
  }
  services: SystemService[]
  security: {
    accessTokenTtl: string
    refreshTokenDays: number
    bcryptRounds: number
    clientOrigin: string
    auditRetentionDays: number
  }
}
