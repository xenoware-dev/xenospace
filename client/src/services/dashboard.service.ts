import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type { DashboardOverview } from '@/types/dashboard'

export const dashboardApi = {
  overview: () =>
    api.get<ApiEnvelope<DashboardOverview>>('/dashboard').then((r) => r.data),
}
