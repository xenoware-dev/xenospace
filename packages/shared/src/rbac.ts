/**
 * Role-based access control.
 *
 * Roles are coarse labels; every authorization decision in the API is made
 * against a *permission*, never against a role string. That indirection is what
 * lets us add roles (QA, PM, CONTRACTOR) later without touching route handlers.
 */

export const ROLES = ['ADMIN', 'DEVELOPER'] as const;
export type Role = (typeof ROLES)[number];

/** Human labels. ADMIN is surfaced as "Team Lead" throughout the product. */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Team Lead',
  DEVELOPER: 'Developer',
};

export const PERMISSIONS = [
  // Projects
  'project:create', 'project:read', 'project:read_all', 'project:update',
  'project:delete', 'project:archive', 'project:manage_members',
  // Tasks
  'task:create', 'task:read', 'task:read_all', 'task:update', 'task:update_own',
  'task:delete', 'task:assign', 'task:transition', 'task:estimate',
  // Team
  'member:read', 'member:invite', 'member:update', 'member:update_role',
  'member:remove', 'member:deactivate',
  // Sprints
  'sprint:create', 'sprint:read', 'sprint:update', 'sprint:delete',
  'sprint:start', 'sprint:complete',
  // Issues & bugs
  'issue:create', 'issue:read', 'issue:update', 'issue:update_own',
  'issue:delete', 'issue:assign', 'issue:triage', 'issue:close',
  // Code review
  'review:create', 'review:read', 'review:comment', 'review:approve',
  'review:request_changes', 'review:merge',
  // Git repositories
  'repo:read', 'repo:connect', 'repo:update', 'repo:disconnect',
  // Deployments
  'deploy:read', 'deploy:create', 'deploy:approve', 'deploy:rollback',
  // Calendar
  'calendar:read', 'calendar:create', 'calendar:update', 'calendar:delete',
  // Knowledge base
  'kb:read', 'kb:create', 'kb:update', 'kb:update_own', 'kb:delete', 'kb:publish',
  // Files & docs
  'file:read', 'file:upload', 'file:delete', 'file:delete_any',
  // Chat
  'chat:read', 'chat:write', 'chat:channel_create', 'chat:channel_manage',
  'chat:message_delete_own', 'chat:message_delete_any',
  // Notifications
  'notification:read', 'notification:manage',
  // Activity & audit
  'activity:read', 'activity:read_all', 'audit:read',
  // Reports
  'report:read', 'report:read_all', 'report:export',
  // Settings
  'settings:read', 'settings:update_own', 'settings:update_org',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permissions granted to a developer. Deliberately written as the explicit
 * allow-list rather than "admin minus X" so that adding an admin capability
 * never silently widens developer access.
 */
const DEVELOPER_PERMISSIONS: readonly Permission[] = [
  'project:read',
  'task:read', 'task:update_own', 'task:transition', 'task:estimate', 'task:create',
  'member:read',
  'sprint:read',
  'issue:create', 'issue:read', 'issue:update_own', 'issue:close',
  'review:create', 'review:read', 'review:comment', 'review:request_changes',
  'repo:read',
  'deploy:read',
  'calendar:read', 'calendar:create', 'calendar:update', 'calendar:delete',
  'kb:read', 'kb:create', 'kb:update_own',
  'file:read', 'file:upload', 'file:delete',
  'chat:read', 'chat:write', 'chat:message_delete_own',
  'notification:read', 'notification:manage',
  'activity:read',
  'report:read',
  'settings:read', 'settings:update_own',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // The team lead holds every permission in the system.
  ADMIN: PERMISSIONS,
  DEVELOPER: DEVELOPER_PERMISSIONS,
};

const PERMISSION_SETS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(ROLE_PERMISSIONS.ADMIN),
  DEVELOPER: new Set(ROLE_PERMISSIONS.DEVELOPER),
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSION_SETS[role]?.has(permission) ?? false;
}

export function canAny(role: Role | undefined | null, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function canAll(role: Role | undefined | null, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

export function permissionsFor(role: Role): Permission[] {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/**
 * Permissions suffixed `_own` are ownership-scoped: holding one authorizes the
 * action only when the actor owns the record. Route handlers pair the
 * permission check with an ownership check; this helper keeps the convention
 * discoverable rather than tribal knowledge.
 */
export function isOwnershipScoped(permission: Permission): boolean {
  return permission.endsWith('_own');
}
