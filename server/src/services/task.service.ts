import type { QueryFilter } from 'mongoose'

import { Project } from '@/models/Project.model'
import { Task, type ITask } from '@/models/Task.model'
import { TaskList } from '@/models/TaskList.model'
import { User } from '@/models/User.model'
import {
  PROJECT_MANAGER_ROLES,
  TASK_PRIORITY_WEIGHTS,
  type Role,
  type TaskPriority,
} from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { idOf } from '@/utils/refs'
import { serializeTask } from '@/utils/serialize-task'

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

const POPULATE = [
  { path: 'list', select: 'name isDone' },
  { path: 'project', select: 'name key' },
  { path: 'assignee', select: USER_REF_FIELDS },
  { path: 'createdBy', select: USER_REF_FIELDS },
]

const SORTS = {
  board: { position: 1 },
  recent: { updatedAt: -1 },
  created: { createdAt: -1 },
  dueDate: { dueDate: 1 },
  priority: { priorityWeight: -1, dueDate: 1 },
  title: { title: 1 },
} as const

interface TaskInput {
  title?: string
  description?: string
  list?: string
  project?: string | null
  assignee?: string | null
  priority?: TaskPriority
  dueDate?: Date | null
  tags?: string[]
}

interface ListTasksInput {
  page: number
  limit: number
  search?: string
  list?: string
  priority?: TaskPriority
  project?: string
  assignee?: string
  creator?: string
  mine?: boolean
  due?: 'overdue' | 'today' | 'week' | 'none'
  includeDone?: boolean
  sort: keyof typeof SORTS
}

interface Actor {
  id: string
  role: Role
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * Editing a card's content is limited to its creator, whoever it is assigned to,
 * a manager, or the lead of the project it sits in — so a personal todo stays
 * personal while project work stays open to the people running the project.
 * Moving a card around the shared board is deliberately open to everyone.
 */
async function assertCanManage(task: ITask, actor: Actor) {
  if (
    PROJECT_MANAGER_ROLES.includes(actor.role) ||
    idOf(task.createdBy) === actor.id ||
    (task.assignee && idOf(task.assignee) === actor.id)
  ) {
    return
  }

  if (task.project) {
    const project = await Project.findById(idOf(task.project)).select('lead')
    if (project && idOf(project.lead) === actor.id) return
  }

  throw ApiError.forbidden('You can only change tasks you created, own or manage')
}

// Task references come from a counter on the project, incremented atomically so
// two people creating at once cannot land on the same number.
async function mintReference(projectId: string) {
  const project = await Project.findByIdAndUpdate(
    projectId,
    { $inc: { taskSequence: 1 } },
    { returnDocument: 'after' }
  ).select('key taskSequence')

  if (!project) {
    throw ApiError.badRequest('The selected project does not exist')
  }

  return `${project.key}-${project.taskSequence}`
}

async function resolveList(listId?: string) {
  if (listId) {
    const taskList = await TaskList.findById(listId)
    if (!taskList) throw ApiError.badRequest('That list does not exist')
    return taskList
  }

  // A card created without a column lands in the first one, like a Trello inbox.
  const first = await TaskList.findOne().sort({ position: 1 })
  if (!first) {
    throw ApiError.badRequest('Add a list to the board before creating tasks')
  }
  return first
}

async function assertReferencesExist(input: TaskInput) {
  if (input.project) {
    const project = await Project.exists({ _id: input.project })
    if (!project) throw ApiError.badRequest('The selected project does not exist')
  }
  if (input.assignee) {
    const assignee = await User.exists({ _id: input.assignee, isActive: true })
    if (!assignee) throw ApiError.badRequest('The selected assignee does not exist')
  }
}

/** Writes 0..n-1 back onto a list so positions never drift or collide. */
async function renumber(listId: string, orderedIds: string[]) {
  if (orderedIds.length === 0) return
  await Task.bulkWrite(
    orderedIds.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { position: index, list: listId } },
    }))
  )
}

async function cardIdsIn(listId: string) {
  const cards = await Task.find({ list: listId }).sort({ position: 1 }).select('_id')
  return cards.map((card) => String(card._id))
}

async function list(input: ListTasksInput, actor: Actor) {
  const filter: QueryFilter<ITask> = {}
  // Several filters need their own $or, so they are collected and $and-ed.
  const and: QueryFilter<ITask>[] = []

  if (input.search) {
    const regex = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    and.push({
      $or: [{ title: regex }, { description: regex }, { reference: regex }, { tags: regex }],
    })
  }

  if (input.list) filter.list = input.list
  if (!input.includeDone) filter.isDone = false

  if (input.priority) filter.priority = input.priority
  if (input.project) filter.project = input.project === 'none' ? null : input.project
  if (input.assignee) filter.assignee = input.assignee === 'none' ? null : input.assignee
  if (input.creator) filter.createdBy = input.creator

  if (input.mine) {
    and.push({ $or: [{ assignee: actor.id }, { createdBy: actor.id, assignee: null }] })
  }

  if (input.due) {
    const today = startOfToday()
    if (input.due === 'overdue') {
      and.push({ dueDate: { $ne: null, $lt: today }, isDone: false })
    } else if (input.due === 'today') {
      and.push({ dueDate: { $gte: today, $lt: addDays(today, 1) } })
    } else if (input.due === 'none') {
      // Cards nobody has dated yet — what the calendar's tray is filled from.
      and.push({ dueDate: null })
    } else {
      and.push({ dueDate: { $gte: today, $lt: addDays(today, 7) } })
    }
  }

  if (and.length) filter.$and = and

  const skip = (input.page - 1) * input.limit

  const [tasks, total] = await Promise.all([
    Task.find(filter).populate(POPULATE).sort(SORTS[input.sort]).skip(skip).limit(input.limit),
    Task.countDocuments(filter),
  ])

  return {
    tasks: tasks.map(serializeTask),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

/** Counts for the header tiles. */
async function summary(actor: Actor) {
  const today = startOfToday()
  const mine = { $or: [{ assignee: actor.id }, { createdBy: actor.id, assignee: null }] }

  const [total, done, overdue, dueToday, mineOpen] = await Promise.all([
    Task.countDocuments({}),
    Task.countDocuments({ isDone: true }),
    Task.countDocuments({ dueDate: { $ne: null, $lt: today }, isDone: false }),
    Task.countDocuments({ dueDate: { $gte: today, $lt: addDays(today, 1) }, isDone: false }),
    Task.countDocuments({ $and: [mine, { isDone: false }] }),
  ])

  return { total, done, open: total - done, overdue, dueToday, mineOpen }
}

async function getById(id: string) {
  const task = await Task.findById(id).populate(POPULATE)
  if (!task) {
    throw ApiError.notFound('Task not found')
  }
  return serializeTask(task)
}

async function create(input: TaskInput & { title: string }, actor: Actor) {
  await assertReferencesExist(input)

  const targetList = await resolveList(input.list)
  const priority = input.priority ?? 'MEDIUM'

  // New cards go to the top of their column, where Trello's composer puts them.
  await Task.updateMany({ list: targetList._id }, { $inc: { position: 1 } })

  const created = await Task.create({
    ...input,
    list: targetList._id,
    position: 0,
    isDone: targetList.isDone,
    completedAt: targetList.isDone ? new Date() : null,
    priority,
    priorityWeight: TASK_PRIORITY_WEIGHTS[priority],
    reference: input.project ? await mintReference(input.project) : null,
    createdBy: actor.id,
  })

  await created.populate(POPULATE)
  return serializeTask(created)
}

async function update(id: string, input: TaskInput, actor: Actor) {
  const task = await Task.findById(id)
  if (!task) {
    throw ApiError.notFound('Task not found')
  }
  await assertCanManage(task, actor)
  await assertReferencesExist(input)

  const patch: Record<string, unknown> = { ...input }

  if (input.priority) {
    patch.priorityWeight = TASK_PRIORITY_WEIGHTS[input.priority]
  }

  // Moving a task to another project re-keys it, so the reference always matches
  // the project it is actually in.
  if (input.project !== undefined && input.project !== idOf(task.project)) {
    patch.reference = input.project ? await mintReference(input.project) : null
  }

  // Changing the column from the edit form drops the card at the top of it.
  if (input.list && input.list !== idOf(task.list)) {
    const targetList = await resolveList(input.list)
    await Task.updateMany({ list: targetList._id }, { $inc: { position: 1 } })
    patch.position = 0
    patch.isDone = targetList.isDone
    patch.completedAt = targetList.isDone ? (task.completedAt ?? new Date()) : null
  }

  const updated = await Task.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  }).populate(POPULATE)

  return serializeTask(updated!)
}

/**
 * Drops a card at `index` of `list`, renumbering the source and destination so
 * the order the board shows is the order that is stored. Anyone on the board may
 * do this — it rearranges the board rather than editing the card's content.
 */
async function move(id: string, input: { list: string; index: number }) {
  const task = await Task.findById(id)
  if (!task) {
    throw ApiError.notFound('Task not found')
  }

  const targetList = await resolveList(input.list)
  const targetId = String(targetList._id)
  const sourceId = idOf(task.list)

  const destinationIds = (await cardIdsIn(targetId)).filter((cardId) => cardId !== id)
  const index = Math.max(0, Math.min(input.index, destinationIds.length))
  destinationIds.splice(index, 0, id)

  if (sourceId !== targetId) {
    const sourceIds = (await cardIdsIn(sourceId)).filter((cardId) => cardId !== id)
    await renumber(sourceId, sourceIds)
  }

  await renumber(targetId, destinationIds)

  await Task.findByIdAndUpdate(id, {
    isDone: targetList.isDone,
    completedAt: targetList.isDone ? (task.completedAt ?? new Date()) : null,
  })

  const moved = await Task.findById(id).populate(POPULATE)
  return serializeTask(moved!)
}

async function remove(id: string, actor: Actor) {
  const task = await Task.findById(id)
  if (!task) {
    throw ApiError.notFound('Task not found')
  }
  await assertCanManage(task, actor)

  const listId = idOf(task.list)
  await task.deleteOne()
  await renumber(listId, await cardIdsIn(listId))
}

export const taskService = { list, summary, getById, create, update, move, remove }
