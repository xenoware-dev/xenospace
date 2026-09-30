import { z } from 'zod'

import { ROLES } from '@/types/enums'

export const listUsersQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().max(100).optional(),
    role: z.enum(ROLES).optional(),
    department: z.string().trim().optional(),
    status: z.enum(['active', 'inactive']).optional(),
  }),
})

export const userIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
})

export const updateOwnProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    bio: z.string().trim().max(500).optional(),
    department: z.string().trim().nullable().optional(),
    skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    avatarUrl: z.url().nullable().optional(),
  }),
})

export const updateUserRoleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ role: z.enum(ROLES) }),
})

export const updateUserStatusSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ isActive: z.boolean() }),
})
