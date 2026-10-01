import { Department } from '@/models/Department.model'
import type { IUser } from '@/models/User.model'
import { User } from '@/models/User.model'
import { auditService } from '@/services/audit.service'
import { ApiError } from '@/utils/ApiError'

/** Who performed a department change, and from where, for the audit entry. */
interface Actor {
  user: IUser
  ip?: string
}

async function list() {
  return Department.find().sort({ name: 1 })
}

async function create(input: { name: string; description?: string }, actor: Actor) {
  const existing = await Department.findOne({ name: input.name })
  if (existing) {
    throw ApiError.conflict('A department with this name already exists')
  }

  const department = await Department.create(input)

  await auditService.record({
    actor: actor.user,
    action: 'DEPARTMENT_CREATED',
    entity: 'DEPARTMENT',
    entityId: String(department._id),
    entityLabel: department.name,
    summary: `Created the ${department.name} department`,
    after: department.name,
    ip: actor.ip,
  })

  return department
}

async function update(id: string, input: { name?: string; description?: string }, actor: Actor) {
  if (input.name) {
    const existing = await Department.findOne({ name: input.name, _id: { $ne: id } })
    if (existing) {
      throw ApiError.conflict('A department with this name already exists')
    }
  }

  // Read the old name first: `findByIdAndUpdate` returns the new document, and
  // the entry has to say what the department used to be called.
  const previous = await Department.findById(id).select('name')
  const department = await Department.findByIdAndUpdate(id, input, { returnDocument: 'after' })
  if (!department || !previous) {
    throw ApiError.notFound('Department not found')
  }

  await auditService.record({
    actor: actor.user,
    action: 'DEPARTMENT_UPDATED',
    entity: 'DEPARTMENT',
    entityId: String(department._id),
    entityLabel: department.name,
    summary:
      previous.name === department.name
        ? `Updated the ${department.name} department`
        : `Renamed the ${previous.name} department to ${department.name}`,
    before: previous.name,
    after: department.name,
    ip: actor.ip,
  })

  return department
}

async function remove(id: string, actor: Actor) {
  const department = await Department.findById(id)
  if (!department) {
    throw ApiError.notFound('Department not found')
  }

  // Unassign the department from any members before deleting it.
  const { modifiedCount } = await User.updateMany({ department: id }, { department: null })
  await department.deleteOne()

  await auditService.record({
    actor: actor.user,
    action: 'DEPARTMENT_DELETED',
    entity: 'DEPARTMENT',
    entityId: id,
    entityLabel: department.name,
    summary:
      modifiedCount > 0
        ? `Deleted the ${department.name} department and unassigned ${modifiedCount} ${modifiedCount === 1 ? 'member' : 'members'}`
        : `Deleted the ${department.name} department`,
    before: department.name,
    ip: actor.ip,
  })
}

export const departmentService = { list, create, update, remove }
