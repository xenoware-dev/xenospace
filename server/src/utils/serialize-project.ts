import type { HydratedDocument } from 'mongoose'

import type { IProject } from '@/models/Project.model'
import {
  toDepartmentRef,
  toUserRef,
  type DepartmentRef,
  type UserRef,
} from '@/utils/refs'

export interface SafeProject {
  id: string
  name: string
  key: string
  description: string
  status: string
  priority: string
  lead: UserRef | null
  members: UserRef[]
  department: DepartmentRef | null
  tags: string[]
  startDate: Date | null
  dueDate: Date | null
  progress: number
  memberCount: number
  createdAt: Date
  updatedAt: Date
}

export function serializeProject(project: HydratedDocument<IProject>): SafeProject {
  const members = (project.members as unknown[]).map(toUserRef).filter((m): m is UserRef => !!m)

  return {
    id: String(project._id),
    name: project.name,
    key: project.key,
    description: project.description ?? '',
    status: project.status,
    priority: project.priority,
    lead: toUserRef(project.lead),
    members,
    department: toDepartmentRef(project.department),
    tags: project.tags ?? [],
    startDate: project.startDate ?? null,
    dueDate: project.dueDate ?? null,
    progress: project.progress ?? 0,
    memberCount: project.members?.length ?? 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}
