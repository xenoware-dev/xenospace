import { z } from 'zod'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const listNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    /** `unread` backs the bell's dropdown; `all` backs the full page. */
    filter: z.enum(['all', 'unread']).default('all'),
  }),
})

export const notificationIdSchema = z.object({
  params: z.object({ id: objectId }),
})
