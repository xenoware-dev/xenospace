import { api } from '@/lib/axios'
import type { AdminOverview } from '@/types/admin'
import type { ApiEnvelope } from '@/types/auth'

export const adminApi = {
  overview: () =>
    api.get<ApiEnvelope<AdminOverview>>('/admin/overview').then((r) => r.data),
}
