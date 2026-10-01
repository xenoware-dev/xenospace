import { z } from 'zod'

import { AUDIT_ACTIONS } from '@/types/enums'

export const auditLogQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    action: z.enum(AUDIT_ACTIONS).optional(),
    actor: z.string().trim().optional(),
    search: z.string().trim().max(100).optional(),
  }),
})
