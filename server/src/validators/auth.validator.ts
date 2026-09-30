import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name is too short').max(100),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters')
      .max(32)
      .regex(/^[a-z0-9._-]+$/, 'Username can only contain letters, numbers, dots, dashes and underscores'),
    email: z.email('Enter a valid email address').trim().toLowerCase(),
    password: passwordSchema,
  }),
})

export const loginSchema = z.object({
  body: z.object({
    email: z.email('Enter a valid email address').trim().toLowerCase(),
    password: z.string().min(1, 'Password is required'),
  }),
})

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.email('Enter a valid email address').trim().toLowerCase(),
  }),
})

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: passwordSchema,
  }),
})

export const verifyEmailSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
})

export const resendVerificationSchema = z.object({
  body: z.object({
    email: z.email('Enter a valid email address').trim().toLowerCase(),
  }),
})

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
  }),
})
