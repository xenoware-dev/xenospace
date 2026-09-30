import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type { Department } from '@/types/team'

export const departmentApi = {
  list: () =>
    api.get<ApiEnvelope<{ departments: Department[] }>>('/departments').then((r) => r.data),

  create: (payload: { name: string; description?: string }) =>
    api
      .post<ApiEnvelope<{ department: Department }>>('/departments', payload)
      .then((r) => r.data),

  update: (id: string, payload: { name?: string; description?: string }) =>
    api
      .patch<ApiEnvelope<{ department: Department }>>(`/departments/${id}`, payload)
      .then((r) => r.data),

  remove: (id: string) =>
    api.delete<ApiEnvelope<null>>(`/departments/${id}`).then((r) => r.data),
}
