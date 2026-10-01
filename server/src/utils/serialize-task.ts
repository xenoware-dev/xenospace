import type { HydratedDocument } from 'mongoose'

import type { ITask } from '@/models/Task.model'
import type { ITaskList } from '@/models/TaskList.model'
import {
  idOf,
  toProjectRef,
  toTaskListRef,
  toUserRef,
  type ProjectRef,
  type TaskListRef,
  type UserRef,
} from '@/utils/refs'

export interface SafeTask {
  id: string
  title: string
  description: string
  reference: string | null
  /** The column id, always present, plus the expanded list when it was populated. */
  listId: string
  list: TaskListRef | null
  position: number
  isDone: boolean
  project: ProjectRef | null
  assignee: UserRef | null
  createdBy: UserRef | null
  priority: string
  dueDate: Date | null
  tags: string[]
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SafeTaskList {
  id: string
  name: string
  position: number
  isDone: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export function serializeTask(task: HydratedDocument<ITask>): SafeTask {
  return {
    id: String(task._id),
    title: task.title,
    description: task.description ?? '',
    reference: task.reference ?? null,
    listId: idOf(task.list),
    list: toTaskListRef(task.list),
    position: task.position ?? 0,
    isDone: task.isDone ?? false,
    project: toProjectRef(task.project),
    assignee: toUserRef(task.assignee),
    createdBy: toUserRef(task.createdBy),
    priority: task.priority,
    dueDate: task.dueDate ?? null,
    tags: task.tags ?? [],
    completedAt: task.completedAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

export function serializeTaskList(list: HydratedDocument<ITaskList>): SafeTaskList {
  return {
    id: String(list._id),
    name: list.name,
    position: list.position ?? 0,
    isDone: list.isDone ?? false,
    createdBy: idOf(list.createdBy),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  }
}
