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
