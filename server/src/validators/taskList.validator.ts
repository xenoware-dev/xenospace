import { z } from 'zod'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createTaskListSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Give the list a name').max(60),
    isDone: z.boolean().optional(),
  }),
})

export const updateTaskListSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().trim().min(1, 'Give the list a name').max(60).optional(),
      isDone: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, 'Nothing to update'),
})

export const reorderTaskListsSchema = z.object({
  body: z.object({
    ids: z.array(objectId).min(1, 'Send the lists in their new order'),
  }),
})

export const taskListIdSchema = z.object({
  params: z.object({ id: objectId }),
})
