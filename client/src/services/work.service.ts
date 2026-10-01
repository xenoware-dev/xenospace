import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type { MyWork, Workload } from '@/types/work'

export const workApi = {
  mine: () => api.get<ApiEnvelope<MyWork>>('/work/mine').then((r) => r.data),

  workload: () => api.get<ApiEnvelope<Workload>>('/work/workload').then((r) => r.data),
}
