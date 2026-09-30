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

export type PresenceStatus = 'ONLINE' | 'AWAY' | 'BUSY' | 'OFFLINE'

export interface DepartmentRef {
  id: string
  name: string
}

export interface User {
  id: string
  name: string
  username: string
  email: string
  role: Role
  avatarUrl: string | null
  department: DepartmentRef | null
  phone: string | null
  bio: string
  skills: string[]
  presenceStatus: PresenceStatus
  isActive: boolean
  isEmailVerified: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface ApiEnvelope<T> {
  success: boolean
  message: string
  data: T
}
