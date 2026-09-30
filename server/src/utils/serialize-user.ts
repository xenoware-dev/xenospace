import type { HydratedDocument } from 'mongoose'

import type { IDepartment } from '@/models/Department.model'
import type { IUser } from '@/models/User.model'

export interface DepartmentRef {
  id: string
  name: string
}

export interface SafeUser {
  id: string
  name: string
  username: string
  email: string
  role: string
  avatarUrl: string | null
  department: DepartmentRef | null
  phone: string | null
  bio: string
  skills: string[]
  presenceStatus: string
  isActive: boolean
  isEmailVerified: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

// Handles both a populated department sub-document and a bare (or absent) ObjectId.
export function serializeUser(user: HydratedDocument<IUser>): SafeUser {
  const dept = user.department as unknown
  const department: DepartmentRef | null =
    dept && typeof dept === 'object' && 'name' in dept
      ? { id: String((dept as HydratedDocument<IDepartment>)._id), name: (dept as HydratedDocument<IDepartment>).name }
      : null

  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    department,
    phone: user.phone ?? null,
    bio: user.bio ?? '',
    skills: user.skills ?? [],
    presenceStatus: user.presenceStatus,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  }
}
