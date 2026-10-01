import { Department } from '@/models/Department.model'
import { FileNode } from '@/models/FileNode.model'
import { Project } from '@/models/Project.model'
import { Task } from '@/models/Task.model'
import { User } from '@/models/User.model'
import { PROJECT_STATUSES, ROLES, type ProjectStatus, type Role } from '@/types/enums'
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

export const adminService = { overview }
