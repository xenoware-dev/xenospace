import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type {
  ListProjectsParams,
  Pagination,
  Project,
  ProjectPayload,
  ProjectSummary,
} from '@/types/project'

export const projectApi = {
  list: (params: ListProjectsParams) =>
    api
      .get<ApiEnvelope<{ projects: Project[]; pagination: Pagination }>>('/projects', { params })
      .then((r) => r.data),

  summary: () =>
    api.get<ApiEnvelope<{ summary: ProjectSummary }>>('/projects/summary').then((r) => r.data),

  get: (id: string) =>
    api
      .get<ApiEnvelope<{ project: Project; canManage: boolean }>>(`/projects/${id}`)
      .then((r) => r.data),

  create: (payload: ProjectPayload) =>
    api.post<ApiEnvelope<{ project: Project }>>('/projects', payload).then((r) => r.data),

  update: (id: string, payload: Partial<ProjectPayload>) =>
    api.patch<ApiEnvelope<{ project: Project }>>(`/projects/${id}`, payload).then((r) => r.data),

  remove: (id: string) => api.delete<ApiEnvelope<null>>(`/projects/${id}`).then((r) => r.data),

  addMember: (id: string, userId: string) =>
    api
      .post<ApiEnvelope<{ project: Project }>>(`/projects/${id}/members`, { userId })
      .then((r) => r.data),

  removeMember: (id: string, userId: string) =>
    api
      .delete<ApiEnvelope<{ project: Project }>>(`/projects/${id}/members/${userId}`)
      .then((r) => r.data),
}
