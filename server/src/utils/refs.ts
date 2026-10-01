import type { HydratedDocument } from 'mongoose'

import type { IDepartment } from '@/models/Department.model'
import type { IProject } from '@/models/Project.model'
import type { ITaskList } from '@/models/TaskList.model'
import type { IUser } from '@/models/User.model'

export interface UserRef {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: string
  presenceStatus: string
}

export interface DepartmentRef {
  id: string
  name: string
}

export interface ProjectRef {
  id: string
  name: string
  key: string
}

export interface TaskListRef {
  id: string
  name: string
  isDone: boolean
}

/**
 * The id behind a reference that may or may not be populated: list and detail
 * queries populate their relations, so stringifying the value itself would
 * yield a whole document rather than its id.
 */
export function idOf(value: unknown) {
  if (!value) return ''
  if (typeof value === 'object' && '_id' in value) {
    return String((value as { _id: unknown })._id)
  }
  return String(value)
}

function isPopulated<T extends object>(value: unknown, key: keyof T): value is HydratedDocument<T> {
  return !!value && typeof value === 'object' && key in value
}

// A bare ObjectId, or a relation whose row was deleted, serializes to null.
export function toUserRef(value: unknown): UserRef | null {
  if (!isPopulated<IUser>(value, 'username')) return null
  return {
    id: String(value._id),
    name: value.name,
    username: value.username,
    avatarUrl: value.avatarUrl ?? null,
    role: value.role,
    presenceStatus: value.presenceStatus,
  }
}

export function toDepartmentRef(value: unknown): DepartmentRef | null {
  if (!isPopulated<IDepartment>(value, 'name')) return null
  return { id: String(value._id), name: value.name }
}

export function toProjectRef(value: unknown): ProjectRef | null {
  if (!isPopulated<IProject>(value, 'key')) return null
  return { id: String(value._id), name: value.name, key: value.key }
}

export function toTaskListRef(value: unknown): TaskListRef | null {
  if (!isPopulated<ITaskList>(value, 'isDone')) return null
  return { id: String(value._id), name: value.name, isDone: value.isDone }
}
