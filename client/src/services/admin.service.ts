import { api } from '@/lib/axios'
import type {
  AdminOverview,
  AdminRoles,
  AdminSystem,
  AuditAction,
  AuditLogPage,
} from '@/types/admin'
import type { ApiEnvelope } from '@/types/auth'

export interface AuditLogQuery {
  page?: number
  limit?: number
  action?: AuditAction
  actor?: string
  search?: string
}

export const adminApi = {
  overview: () =>
    api.get<ApiEnvelope<AdminOverview>>('/admin/overview').then((r) => r.data),

  roles: () => api.get<ApiEnvelope<AdminRoles>>('/admin/roles').then((r) => r.data),

  system: () => api.get<ApiEnvelope<AdminSystem>>('/admin/system').then((r) => r.data),

  auditLog: (params: AuditLogQuery = {}) =>
    api.get<ApiEnvelope<AuditLogPage>>('/admin/audit-log', { params }).then((r) => r.data),
}
