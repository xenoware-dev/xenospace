import { Task } from '@/models/Task.model'
import { TaskList } from '@/models/TaskList.model'
import { DEFAULT_TASK_LISTS, PROJECT_MANAGER_ROLES, type Role } from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { idOf } from '@/utils/refs'
import { serializeTaskList } from '@/utils/serialize-task'

interface Actor {
  id: string
  role: Role
}

/** Deleting a shared column takes other people's cards with it, so it is restricted. */
function assertCanDelete(createdBy: unknown, actor: Actor) {
  if (PROJECT_MANAGER_ROLES.includes(actor.role) || idOf(createdBy) === actor.id) return
  throw ApiError.forbidden('Only a manager or the person who added this list can delete it')
}

async function fetchAll() {
  const lists = await TaskList.find().sort({ position: 1 })
  return lists.map(serializeTaskList)
}

// A board with no columns cannot be used, so the first read of an empty board
// seeds the usual four. Anyone is then free to rename, reorder or replace them.
async function list(actor: Actor) {
  const existing = await fetchAll()
  if (existing.length > 0) {
    return existing
  }

  await TaskList.insertMany(
    DEFAULT_TASK_LISTS.map((entry, index) => ({
      ...entry,
      position: index,
      createdBy: actor.id,
    }))
  )

  return fetchAll()
}

async function create(input: { name: string; isDone?: boolean }, actor: Actor) {
  const last = await TaskList.findOne().sort({ position: -1 }).select('position')

  const created = await TaskList.create({
    name: input.name,
    isDone: input.isDone ?? false,
    position: (last?.position ?? -1) + 1,
    createdBy: actor.id,
  })

  return serializeTaskList(created)
}

async function update(id: string, input: { name?: string; isDone?: boolean }) {
  const taskList = await TaskList.findById(id)
  if (!taskList) {
    throw ApiError.notFound('List not found')
  }

  const updated = await TaskList.findByIdAndUpdate(id, input, {
    returnDocument: 'after',
    runValidators: true,
  })

  // Flagging a column as "done" (or clearing that) settles every card in it.
  if (input.isDone !== undefined && input.isDone !== taskList.isDone) {
    await Task.updateMany(
      { list: id },
      input.isDone
        ? { isDone: true, completedAt: new Date() }
        : { isDone: false, completedAt: null }
    )
  }

  return serializeTaskList(updated!)
}

/** Takes the full set of list ids in their new left-to-right order. */
async function reorder(ids: string[]) {
  const lists = await TaskList.find({ _id: { $in: ids } }).select('_id')
  if (lists.length !== ids.length) {
    throw ApiError.badRequest('That list order refers to a list that no longer exists')
  }

  await TaskList.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { position: index } },
    }))
  )

  return fetchAll()
}

async function remove(id: string, actor: Actor) {
  const taskList = await TaskList.findById(id)
  if (!taskList) {
    throw ApiError.notFound('List not found')
  }
  assertCanDelete(taskList.createdBy, actor)

  const remaining = await TaskList.countDocuments({ _id: { $ne: id } })
  if (remaining === 0) {
    throw ApiError.badRequest('A board needs at least one list')
  }

  // Cards live inside their column, so they go with it — the client confirms first.
  const { deletedCount } = await Task.deleteMany({ list: id })
  await taskList.deleteOne()

  return { deletedCards: deletedCount ?? 0 }
}

export const taskListService = { list, create, update, reorder, remove }
