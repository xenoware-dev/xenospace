import { api } from '@/lib/axios'
import type { ApiEnvelope, Role, User } from '@/types/auth'
import type { ListUsersParams, Pagination } from '@/types/team'

export interface UpdateOwnProfilePayload {
  name?: string
  bio?: string
  department?: string | null
  skills?: string[]
  phone?: string | null
  avatarUrl?: string | null
}

export const userApi = {
  list: (params: ListUsersParams) =>
    api
      .get<ApiEnvelope<{ users: User[]; pagination: Pagination }>>('/users', { params })
      .then((r) => r.data),

  get: (id: string) => api.get<ApiEnvelope<{ user: User }>>(`/users/${id}`).then((r) => r.data),

  updateOwnProfile: (payload: UpdateOwnProfilePayload) =>
    api.patch<ApiEnvelope<{ user: User }>>('/users/me', payload).then((r) => r.data),

  updateRole: (id: string, role: Role) =>
    api.patch<ApiEnvelope<{ user: User }>>(`/users/${id}/role`, { role }).then((r) => r.data),

  updateStatus: (id: string, isActive: boolean) =>
    api
      .patch<ApiEnvelope<{ user: User }>>(`/users/${id}/status`, { isActive })
      .then((r) => r.data),
}
