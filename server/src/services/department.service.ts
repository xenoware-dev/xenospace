import { Department } from '@/models/Department.model'
import { User } from '@/models/User.model'
import { ApiError } from '@/utils/ApiError'

async function list() {
  return Department.find().sort({ name: 1 })
}

async function create(input: { name: string; description?: string }) {
  const existing = await Department.findOne({ name: input.name })
  if (existing) {
    throw ApiError.conflict('A department with this name already exists')
  }

  return Department.create(input)
}

async function update(id: string, input: { name?: string; description?: string }) {
  if (input.name) {
    const existing = await Department.findOne({ name: input.name, _id: { $ne: id } })
    if (existing) {
      throw ApiError.conflict('A department with this name already exists')
    }
  }

  const department = await Department.findByIdAndUpdate(id, input, { returnDocument: 'after' })
  if (!department) {
    throw ApiError.notFound('Department not found')
  }

  return department
}

async function remove(id: string) {
  const department = await Department.findById(id)
  if (!department) {
    throw ApiError.notFound('Department not found')
  }

  // Unassign the department from any members before deleting it.
  await User.updateMany({ department: id }, { department: null })
  await department.deleteOne()
}

export const departmentService = { list, create, update, remove }
