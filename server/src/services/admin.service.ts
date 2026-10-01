import mongoose from 'mongoose'

import { env } from '@/config/env'
import { AuditLog } from '@/models/AuditLog.model'
import { Department } from '@/models/Department.model'
import { FileNode } from '@/models/FileNode.model'
import { Project } from '@/models/Project.model'
import { Task } from '@/models/Task.model'
import { User } from '@/models/User.model'
import {
  ADMIN_ROLES,
  AUDIT_RETENTION_DAYS,
  CATEGORY_MANAGER_ROLES,
  FILE_MANAGER_ROLES,
  KNOWLEDGE_MANAGER_ROLES,
  PROJECT_MANAGER_ROLES,
  PROJECT_STATUSES,
  ROLES,
  WORKLOAD_VIEWER_ROLES,
  type ProjectStatus,
  type Role,
} from '@/types/enums'
import { MAX_UPLOAD_BYTES, UPLOAD_ROOT } from '@/utils/storage'
import { alignWeekly, recentWeekStarts } from '@/utils/weeks'

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** Signups per week over the rolling trend window, zero-filled. */
async function signupsByWeek(weeks: Date[]) {
  const rows = await User.aggregate<{ _id: Date; count: number }>([
    { $match: { createdAt: { $gte: weeks[0] } } },
    {
      $group: {
        _id: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday' } },
        count: { $sum: 1 },
      },
    },
  ])

  return alignWeekly(rows, weeks)
}

/**
 * The organisation at a glance: who is in it, what they are working on, and how
 * much room the file library is taking. Everything here is org-wide — this is
 * the one view that deliberately ignores the caller's own membership, which is
 * why it sits behind `authorize('ADMIN')` rather than alongside the dashboard.
 */
export async function overview() {
  const weeks = recentWeekStarts()
  const thisWeekStart = weeks[weeks.length - 1]
  const today = startOfToday()

  const [
    totalMembers,
    activeMembers,
    pendingVerification,
    onlineMembers,
    signupsTrend,
    roleRows,
    departments,
    departmentRows,
    unassignedMembers,
    projectStatusRows,
    totalTasks,
    openTasks,
    overdueTasks,
    storageRows,
    newestMembers,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ isEmailVerified: false }),
    User.countDocuments({ presenceStatus: { $ne: 'OFFLINE' }, isActive: true }),
    signupsByWeek(weeks),
    User.aggregate<{ _id: Role; count: number }>([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    Department.find().select('name').sort({ name: 1 }),
    User.aggregate<{ _id: string | null; count: number }>([
      { $match: { department: { $ne: null } } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
    ]),
    User.countDocuments({ department: null }),
    Project.aggregate<{ _id: ProjectStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({}),
    Task.countDocuments({ isDone: false }),
    Task.countDocuments({ dueDate: { $ne: null, $lt: today }, isDone: false }),
    FileNode.aggregate<{ _id: null; files: number; size: number }>([
      { $match: { kind: 'FILE', isTrashed: false } },
      { $group: { _id: null, files: { $sum: 1 }, size: { $sum: '$size' } } },
    ]),
    User.find()
      .select('name username avatarUrl role createdAt isEmailVerified')
      .sort({ createdAt: -1 })
      .limit(5),
  ])

  const membersByRole = new Map(roleRows.map((row) => [row._id, row.count]))
  const membersByDepartment = new Map(
    departmentRows.map((row) => [String(row._id), row.count])
  )
  const projectsByStatus = new Map(projectStatusRows.map((row) => [row._id, row.count]))

  const newThisWeek = signupsTrend[signupsTrend.length - 1]
  const lastWeekSignups = signupsTrend[signupsTrend.length - 2] ?? 0

  return {
    members: {
      total: totalMembers,
      active: activeMembers,
      deactivated: totalMembers - activeMembers,
      pendingVerification,
      online: onlineMembers,
      newThisWeek,
      /** This week against last week; null when last week had no signups. */
      deltaPercent: percentChange(newThisWeek, lastWeekSignups),
      /** Twelve weekly buckets, oldest first. */
      signupsTrend,
    },
    // Reported in the canonical privilege order rather than by size, so the
    // list reads the same way every time and the admin rows stay on top.
    roles: ROLES.map((role) => ({ role, count: membersByRole.get(role) ?? 0 })),
    departments: {
      total: departments.length,
      unassignedMembers,
      rows: departments.map((department) => ({
        id: String(department._id),
        name: department.name,
        memberCount: membersByDepartment.get(String(department._id)) ?? 0,
      })),
    },
    projects: {
      // ARCHIVED projects are still real rows, so the total counts them; the
      // breakdown below is what separates them out.
      total: projectStatusRows.reduce((sum, row) => sum + row.count, 0),
      active: projectsByStatus.get('ACTIVE') ?? 0,
      byStatus: PROJECT_STATUSES.map((status) => ({
        status,
        count: projectsByStatus.get(status) ?? 0,
      })),
    },
    tasks: {
      total: totalTasks,
      open: openTasks,
      done: totalTasks - openTasks,
      overdue: overdueTasks,
    },
    storage: {
      files: storageRows[0]?.files ?? 0,
      totalSize: storageRows[0]?.size ?? 0,
    },
    newestMembers: newestMembers.map((member) => ({
      id: String(member._id),
      name: member.name,
      username: member.username,
      avatarUrl: member.avatarUrl ?? null,
      role: member.role,
      isEmailVerified: member.isEmailVerified,
      joinedAt: member.createdAt,
      isNewThisWeek: member.createdAt >= thisWeekStart,
    })),
  }
}

/**
 * The capability matrix. Every row names a real gate somewhere in the API and
 * points at the constant that enforces it, so this page cannot drift from the
 * behaviour it documents — change the constant and the matrix changes with it.
 * `authorize` lets SUPER_ADMIN through unconditionally, which is why it appears
 * in every row below.
 */
const CAPABILITIES: {
  key: string
  label: string
  description: string
  roles: Role[]
}[] = [
  {
    key: 'admin-console',
    label: 'Open the admin console',
    description: 'Reach /admin and everything under it.',
    roles: ADMIN_ROLES,
  },
  {
    key: 'manage-users',
    label: 'Manage members',
    description: 'Change anyone’s role and deactivate accounts.',
    roles: ADMIN_ROLES,
  },
  {
    key: 'grant-admin',
    label: 'Grant admin roles',
    description: 'Promote someone to Admin, or edit an existing admin.',
    roles: ['SUPER_ADMIN'],
  },
  {
    key: 'manage-departments',
    label: 'Manage departments',
    description: 'Create, rename and delete departments.',
    roles: ADMIN_ROLES,
  },
  {
    key: 'manage-projects',
    label: 'Manage any project',
    description: 'Create projects and administer ones they do not lead.',
    roles: PROJECT_MANAGER_ROLES,
  },
  {
    key: 'view-workload',
    label: 'See team workload',
    description: 'View what everyone is carrying, not only their own work.',
    roles: WORKLOAD_VIEWER_ROLES,
  },
  {
    key: 'manage-files',
    label: 'Manage any file',
    description: 'Move, rename and delete nodes they do not own.',
    roles: FILE_MANAGER_ROLES,
  },
  {
    key: 'manage-knowledge',
    label: 'Edit any article',
    description: 'Edit, publish and pin articles across the knowledge base.',
    roles: KNOWLEDGE_MANAGER_ROLES,
  },
  {
    key: 'manage-categories',
    label: 'Curate the shelf',
    description: 'Add, rename and retire article categories.',
    roles: CATEGORY_MANAGER_ROLES,
  },
]

/**
 * Every role with the people in it and what it can do. The counts come from the
 * same collection the directory reads, so a role is never described as empty
 * while somebody holds it.
 */
export async function roles() {
  const [roleRows, activeRows, lastAssigned] = await Promise.all([
    User.aggregate<{ _id: Role; count: number }>([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    User.aggregate<{ _id: Role; count: number }>([
      { $match: { isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    AuditLog.findOne({ action: 'USER_ROLE_CHANGED' })
      .sort({ createdAt: -1 })
      .select('summary createdAt'),
  ])

  const membersByRole = new Map(roleRows.map((row) => [row._id, row.count]))
  const activeByRole = new Map(activeRows.map((row) => [row._id, row.count]))
  const total = roleRows.reduce((sum, row) => sum + row.count, 0)

  return {
    total,
    capabilities: CAPABILITIES.map(({ key, label, description }) => ({
      key,
      label,
      description,
    })),
    // Privilege order, highest first — the same order the directory uses.
    roles: ROLES.map((role) => {
      const count = membersByRole.get(role) ?? 0
      return {
        role,
        count,
        active: activeByRole.get(role) ?? 0,
        isAdmin: ADMIN_ROLES.includes(role),
        share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        capabilities: CAPABILITIES.filter(
          (capability) => role === 'SUPER_ADMIN' || capability.roles.includes(role)
        ).map((capability) => capability.key),
      }
    }),
    lastRoleChange: lastAssigned
      ? { summary: lastAssigned.summary, at: lastAssigned.createdAt }
      : null,
  }
}

/**
 * Runtime diagnostics. Read-only on purpose: this page answers "is the
 * deployment healthy and how is it configured", and anything that changes
 * configuration belongs in the environment, not behind a button here.
 */
export async function system() {
  const connection = mongoose.connection
  const [collections, storageRows, trashedRows, counts] = await Promise.all([
    connection.db?.listCollections().toArray() ?? Promise.resolve([]),
    FileNode.aggregate<{ _id: null; files: number; size: number }>([
      { $match: { kind: 'FILE', isTrashed: false } },
      { $group: { _id: null, files: { $sum: 1 }, size: { $sum: '$size' } } },
    ]),
    FileNode.aggregate<{ _id: null; files: number; size: number }>([
      { $match: { kind: 'FILE', isTrashed: true } },
      { $group: { _id: null, files: { $sum: 1 }, size: { $sum: '$size' } } },
    ]),
    Promise.all([
      User.estimatedDocumentCount(),
      Project.estimatedDocumentCount(),
      Task.estimatedDocumentCount(),
      FileNode.estimatedDocumentCount(),
      Department.estimatedDocumentCount(),
      AuditLog.estimatedDocumentCount(),
    ]),
  ])

  const memory = process.memoryUsage()
  const [users, projects, tasks, files, departments, auditEntries] = counts

  return {
    runtime: {
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      environment: env.NODE_ENV,
      /** Seconds since this process started. */
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000),
      pid: process.pid,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    },
    database: {
      // 1 is "connected" in mongoose's readyState enum; anything else means the
      // console is reading a cache or about to start erroring, so say which.
      status: ['disconnected', 'connected', 'connecting', 'disconnecting'][connection.readyState] ??
        'unknown',
      host: connection.host ?? null,
      name: connection.name ?? null,
      collections: collections.length,
      documents: { users, projects, tasks, files, departments, auditEntries },
    },
    storage: {
      root: UPLOAD_ROOT,
      files: storageRows[0]?.files ?? 0,
      totalSize: storageRows[0]?.size ?? 0,
      trashedFiles: trashedRows[0]?.files ?? 0,
      trashedSize: trashedRows[0]?.size ?? 0,
      maxUploadBytes: MAX_UPLOAD_BYTES,
      maxFilesPerRequest: env.MAX_UPLOAD_FILES,
    },
    // Whether an optional subsystem is wired up, never the credentials for it.
    services: [
      {
        key: 'mail',
        label: 'Transactional email',
        detail: env.SMTP_HOST ? `${env.SMTP_HOST}:${env.SMTP_PORT ?? 587}` : 'No SMTP host set',
        configured: Boolean(env.SMTP_HOST && env.SMTP_USER),
      },
      {
        key: 'database',
        label: 'MongoDB',
        detail: connection.host ? `${connection.host}/${connection.name}` : 'Not connected',
        configured: connection.readyState === 1,
      },
      {
        key: 'uploads',
        label: 'File storage',
        detail: UPLOAD_ROOT,
        configured: true,
      },
      {
        key: 'realtime',
        label: 'Realtime socket',
        detail: `Origin locked to ${env.CLIENT_URL}`,
        configured: true,
      },
    ],
    security: {
      accessTokenTtl: env.ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenDays: env.REFRESH_TOKEN_EXPIRES_IN_DAYS,
      bcryptRounds: env.BCRYPT_SALT_ROUNDS,
      clientOrigin: env.CLIENT_URL,
      auditRetentionDays: AUDIT_RETENTION_DAYS,
    },
  }
}

export const adminService = { overview, roles, system }
