import type { QueryFilter } from 'mongoose'

import { Department } from '@/models/Department.model'
import { User, type IUser } from '@/models/User.model'
import { auditService } from '@/services/audit.service'
import { ADMIN_ROLES, type Role } from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { formatRole } from '@/utils/format-role'
import { serializeUser } from '@/utils/serialize-user'

interface ListUsersInput {
  page: number
  limit: number
  search?: string
  role?: Role
  department?: string
  status?: 'active' | 'inactive'
}

async function listUsers(input: ListUsersInput) {
  const filter: QueryFilter<IUser> = {}

  if (input.search) {
    const regex = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ name: regex }, { username: regex }, { email: regex }]
  }
  if (input.role) filter.role = input.role
  if (input.department) filter.department = input.department
  if (input.status) filter.isActive = input.status === 'active'

  const skip = (input.page - 1) * input.limit

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('department', 'name')
      .sort({ name: 1 })
      .skip(skip)
      .limit(input.limit),
    User.countDocuments(filter),
  ])

  return {
    users: users.map(serializeUser),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

async function getUserById(id: string) {
  const user = await User.findById(id).populate('department', 'name')
  if (!user) {
    throw ApiError.notFound('User not found')
  }
  return serializeUser(user)
}

async function updateOwnProfile(
  userId: string,
  input: {
    name?: string
    bio?: string
    department?: string | null
    skills?: string[]
    phone?: string | null
    avatarUrl?: string | null
  }
) {
  if (input.department) {
    const department = await Department.findById(input.department)
    if (!department) {
      throw ApiError.badRequest('Selected department does not exist')
    }
  }

  const user = await User.findByIdAndUpdate(userId, input, { returnDocument: 'after' }).populate(
    'department',
    'name'
  )
  if (!user) {
    throw ApiError.notFound('User not found')
  }

  return serializeUser(user)
}

async function updateUserRole(actingUser: IUser, targetId: string, role: Role, ip?: string) {
  if (String(actingUser._id) === targetId) {
    throw ApiError.forbidden('You cannot change your own role')
  }

  const isPrivilegedRole = ADMIN_ROLES.includes(role)
  const target = await User.findById(targetId)
  if (!target) {
    throw ApiError.notFound('User not found')
  }

  const targetIsPrivileged = ADMIN_ROLES.includes(target.role)

  // Only a SUPER_ADMIN may grant admin-level roles or modify an existing admin.
  if ((isPrivilegedRole || targetIsPrivileged) && actingUser.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a super admin can manage admin-level roles')
  }

  const previousRole = target.role
  target.role = role
  await target.save()
  await target.populate('department', 'name')

  // A no-op reassignment is not a change, so it leaves no entry.
  if (previousRole !== role) {
    await auditService.record({
      actor: actingUser,
      action: 'USER_ROLE_CHANGED',
      entity: 'USER',
      entityId: targetId,
      entityLabel: target.name,
      summary: `Changed ${target.name}'s role from ${formatRole(previousRole)} to ${formatRole(role)}`,
      before: previousRole,
      after: role,
      ip,
    })
  }

  return serializeUser(target)
}

async function updateUserStatus(
  actingUser: IUser,
  targetId: string,
  isActive: boolean,
  ip?: string
) {
  if (String(actingUser._id) === targetId) {
    throw ApiError.forbidden('You cannot change your own account status')
  }

  const target = await User.findById(targetId)
  if (!target) {
    throw ApiError.notFound('User not found')
  }

  if (ADMIN_ROLES.includes(target.role) && actingUser.role !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Only a super admin can manage other admins')
  }

  const wasActive = target.isActive
  target.isActive = isActive
  if (!isActive) {
    target.refreshTokenHash = null
    target.refreshTokenExpires = null
  }
  await target.save()
  await target.populate('department', 'name')

  if (wasActive !== isActive) {
    await auditService.record({
      actor: actingUser,
      action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'USER',
      entityId: targetId,
      entityLabel: target.name,
      summary: isActive
        ? `Reactivated ${target.name}'s account`
        : `Deactivated ${target.name}'s account and signed them out`,
      ip,
    })
  }

  return serializeUser(target)
}

export const userService = {
  listUsers,
  getUserById,
  updateOwnProfile,
  updateUserRole,
  updateUserStatus,
}
