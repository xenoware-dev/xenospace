import { z } from 'zod'

import { TASK_PRIORITIES } from '@/types/enums'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

/** Filters accept the literal "none" to mean "not set", e.g. a personal todo. */
const objectIdOrNone = z.union([objectId, z.literal('none')])

const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

export const listTasksQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(25),
    search: z.string().trim().max(100).optional(),
    list: objectId.optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    project: objectIdOrNone.optional(),
    assignee: objectIdOrNone.optional(),
    creator: objectId.optional(),
    /** Assigned to the caller, plus their own unassigned todos. */
    mine: boolFlag,
    due: z.enum(['overdue', 'today', 'week', 'none']).optional(),
    includeDone: boolFlag,
    sort: z.enum(['board', 'recent', 'created', 'dueDate', 'priority', 'title']).default('recent'),
  }),
})

export const taskIdSchema = z.object({
  params: z.object({ id: objectId }),
})

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().trim().min(2, 'Title is too short').max(200),
    description: z.string().trim().max(5000).optional(),
    list: objectId.optional(),
    project: objectId.nullable().optional(),
    assignee: objectId.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  }),
})

export const updateTaskSchema = z.object({
  params: z.object({ id: objectId }),
  body: createTaskSchema.shape.body
    .partial()
    .refine((body) => Object.keys(body).length > 0, 'Nothing to update'),
})

export const moveTaskSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    list: objectId,
    index: z.coerce.number().int().min(0),
  }),
})

export const setTaskDoneSchema = z.object({
  params: z.object({ id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id') }),
  body: z.object({ done: z.boolean() }),
})
