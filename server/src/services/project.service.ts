import type { QueryFilter } from 'mongoose'

import { Department } from '@/models/Department.model'
import { Project, type IProject } from '@/models/Project.model'
import { User } from '@/models/User.model'
import {
  PROJECT_MANAGER_ROLES,
  type ProjectPriority,
  type ProjectStatus,
  type Role,
} from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { idOf } from '@/utils/refs'
import { serializeProject } from '@/utils/serialize-project'

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

const POPULATE = [
  { path: 'lead', select: USER_REF_FIELDS },
  { path: 'members', select: USER_REF_FIELDS },
  { path: 'department', select: 'name' },
]

const SORTS = {
  recent: { updatedAt: -1 },
  name: { name: 1 },
  dueDate: { dueDate: 1 },
  progress: { progress: -1 },
} as const

interface ProjectInput {
  name?: string
  key?: string
  description?: string
  status?: ProjectStatus
  priority?: ProjectPriority
  lead?: string
  members?: string[]
  department?: string | null
  tags?: string[]
  startDate?: Date | null
  dueDate?: Date | null
  progress?: number
}

interface ListProjectsInput {
  page: number
  limit: number
  search?: string
  status?: ProjectStatus
  priority?: ProjectPriority
  department?: string
  lead?: string
  member?: string
  mine?: boolean
  sort: keyof typeof SORTS
  includeArchived?: boolean
}

interface Actor {
  id: string
  role: Role
}

/** Managers, leads and admins may manage any project; everyone else only their own. */
function canManage(project: IProject, actor: Actor) {
  return PROJECT_MANAGER_ROLES.includes(actor.role) || idOf(project.lead) === actor.id
}

function assertCanManage(project: IProject, actor: Actor) {
  if (!canManage(project, actor)) {
    throw ApiError.forbidden('Only the project lead or a manager can change this project')
  }
}

// A readable handle derived from the name ("Placement App" -> "PLAC"), with a
// counter appended until it is unique, so callers never have to invent one.
async function generateKey(name: string) {
  const base = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4)
  const root = base.length >= 2 ? base : 'PRJ'

  let candidate = root
  let suffix = 1
  while (await Project.exists({ key: candidate })) {
    candidate = `${root}${suffix}`
    suffix += 1
  }

  return candidate
}

async function assertReferencesExist(input: ProjectInput) {
  if (input.lead) {
    const lead = await User.exists({ _id: input.lead, isActive: true })
    if (!lead) throw ApiError.badRequest('The selected project lead does not exist')
  }

  if (input.members?.length) {
    const found = await User.countDocuments({ _id: { $in: input.members } })
    if (found !== new Set(input.members).size) {
      throw ApiError.badRequest('One or more selected members do not exist')
    }
  }

  if (input.department) {
    const department = await Department.exists({ _id: input.department })
    if (!department) throw ApiError.badRequest('The selected department does not exist')
  }
}

function assertDateOrder(startDate?: Date | null, dueDate?: Date | null) {
  if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
    throw ApiError.badRequest('The due date cannot fall before the start date')
  }
}

/** The lead is always a member, and a member is never listed twice. */
function normalizeMembers(lead: string, members: string[] = []) {
  return [...new Set([lead, ...members])]
}

async function list(input: ListProjectsInput, actor: Actor) {
  const filter: QueryFilter<IProject> = {}

  if (input.search) {
    const regex = new RegExp(input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ name: regex }, { key: regex }, { description: regex }, { tags: regex }]
  }
  if (input.status) filter.status = input.status
  else if (!input.includeArchived) filter.status = { $ne: 'ARCHIVED' }

  if (input.priority) filter.priority = input.priority
  if (input.department) filter.department = input.department
  if (input.lead) filter.lead = input.lead
  if (input.member) filter.members = input.member
  if (input.mine) filter.$and = [{ $or: [{ lead: actor.id }, { members: actor.id }] }]

  const skip = (input.page - 1) * input.limit

  const [projects, total] = await Promise.all([
    Project.find(filter).populate(POPULATE).sort(SORTS[input.sort]).skip(skip).limit(input.limit),
    Project.countDocuments(filter),
  ])

  return {
    projects: projects.map(serializeProject),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

/** Counts for the header tiles, across every project the caller can see. */
async function summary(actor: Actor) {
  const [byStatus, overdue, mine] = await Promise.all([
    Project.aggregate<{ _id: ProjectStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Project.countDocuments({
      dueDate: { $ne: null, $lt: new Date() },
      status: { $nin: ['COMPLETED', 'ARCHIVED'] },
    }),
    Project.countDocuments({ $or: [{ lead: actor.id }, { members: actor.id }] }),
  ])

  const counts = byStatus.reduce<Record<string, number>>((acc, row) => {
    acc[row._id] = row.count
    return acc
  }, {})

  const total = byStatus.reduce((sum, row) => sum + row.count, 0)

  return {
    total,
    active: counts.ACTIVE ?? 0,
    planning: counts.PLANNING ?? 0,
    onHold: counts.ON_HOLD ?? 0,
    completed: counts.COMPLETED ?? 0,
    archived: counts.ARCHIVED ?? 0,
    overdue,
    mine,
  }
}

async function getById(id: string, actor: Actor) {
  const project = await Project.findById(id).populate(POPULATE)
  if (!project) {
    throw ApiError.notFound('Project not found')
  }

  return { project: serializeProject(project), canManage: canManage(project, actor) }
}

async function create(input: ProjectInput & { name: string }, actor: Actor) {
  const lead = input.lead ?? actor.id
  await assertReferencesExist({ ...input, lead })
  assertDateOrder(input.startDate, input.dueDate)

  if (input.key) {
    const existing = await Project.findOne({ key: input.key })
    if (existing) {
      throw ApiError.conflict('A project with this key already exists')
    }
  }

  const created = await Project.create({
    ...input,
    key: input.key ?? (await generateKey(input.name)),
    lead,
    members: normalizeMembers(lead, input.members),
    createdBy: actor.id,
  })

  await created.populate(POPULATE)
  return serializeProject(created)
}

async function update(id: string, input: ProjectInput, actor: Actor) {
  const project = await Project.findById(id)
  if (!project) {
    throw ApiError.notFound('Project not found')
  }
  assertCanManage(project, actor)

  await assertReferencesExist(input)
  assertDateOrder(
    input.startDate === undefined ? project.startDate : input.startDate,
    input.dueDate === undefined ? project.dueDate : input.dueDate
  )

  if (input.key && input.key !== project.key) {
    const existing = await Project.findOne({ key: input.key, _id: { $ne: id } })
    if (existing) {
      throw ApiError.conflict('A project with this key already exists')
    }
  }

  const lead = input.lead ?? idOf(project.lead)
  const patch = {
    ...input,
    // Whether the lead or the roster changed, the lead stays on the roster.
    members: normalizeMembers(
      lead,
      input.members ?? project.members.map(idOf)
    ),
  }

  const updated = await Project.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  }).populate(POPULATE)

  // findById above proved it exists, and nothing here deletes it.
  return serializeProject(updated!)
}

async function remove(id: string, actor: Actor) {
  const project = await Project.findById(id)
  if (!project) {
    throw ApiError.notFound('Project not found')
  }
  assertCanManage(project, actor)

  await project.deleteOne()
}

async function addMember(id: string, userId: string, actor: Actor) {
  const project = await Project.findById(id)
  if (!project) {
    throw ApiError.notFound('Project not found')
  }
  assertCanManage(project, actor)

  const user = await User.exists({ _id: userId })
  if (!user) {
    throw ApiError.badRequest('That user does not exist')
  }
  if (project.members.some((member) => idOf(member) === userId)) {
    throw ApiError.conflict('That person is already on this project')
  }

  const updated = await Project.findByIdAndUpdate(
    id,
    { $addToSet: { members: userId } },
    { returnDocument: 'after' }
  ).populate(POPULATE)

  return serializeProject(updated!)
}

async function removeMember(id: string, userId: string, actor: Actor) {
  const project = await Project.findById(id)
  if (!project) {
    throw ApiError.notFound('Project not found')
  }
  assertCanManage(project, actor)

  if (idOf(project.lead) === userId) {
    throw ApiError.badRequest('Assign a new lead before removing this person')
  }

  const updated = await Project.findByIdAndUpdate(
    id,
    { $pull: { members: userId } },
    { returnDocument: 'after' }
  ).populate(POPULATE)

  return serializeProject(updated!)
}

export const projectService = {
  list,
  summary,
  getById,
  create,
  update,
  remove,
  addMember,
  removeMember,
}
