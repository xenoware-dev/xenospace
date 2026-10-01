import { z } from 'zod'

import { PROJECT_PRIORITIES, PROJECT_STATUSES } from '@/types/enums'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const listProjectsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    search: z.string().trim().max(100).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    priority: z.enum(PROJECT_PRIORITIES).optional(),
    department: objectId.optional(),
    lead: objectId.optional(),
    member: objectId.optional(),
    /** Only projects the caller leads or belongs to. */
    mine: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
    sort: z.enum(['recent', 'name', 'dueDate', 'progress']).default('recent'),
    /** ARCHIVED projects are excluded unless this is set. */
    includeArchived: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
})

export const projectIdSchema = z.object({
  params: z.object({ id: objectId }),
})

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name is too short').max(120),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, 'Key is too short')
      .max(10)
      .regex(/^[A-Za-z0-9]+$/, 'Key can only contain letters and numbers')
      .optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    priority: z.enum(PROJECT_PRIORITIES).optional(),
    lead: objectId.optional(),
    members: z.array(objectId).max(100).optional(),
    department: objectId.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
    startDate: z.coerce.date().nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    progress: z.coerce.number().int().min(0).max(100).optional(),
  }),
})

export const updateProjectSchema = z.object({
  params: z.object({ id: objectId }),
  body: createProjectSchema.shape.body.partial().refine(
    (body) => Object.keys(body).length > 0,
    'Nothing to update'
  ),
})

export const projectMemberSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({ userId: objectId }),
})

export const projectMemberIdSchema = z.object({
  params: z.object({ id: objectId, userId: objectId }),
})
