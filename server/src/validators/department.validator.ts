import { z } from 'zod'

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name is too short').max(80),
    description: z.string().trim().max(300).optional(),
  }),
})

export const updateDepartmentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(2, 'Name is too short').max(80).optional(),
    description: z.string().trim().max(300).optional(),
  }),
})

export const departmentIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
})
