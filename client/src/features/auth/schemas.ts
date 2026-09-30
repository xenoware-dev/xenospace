import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a number')

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is too short').max(100),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters')
      .max(32)
      .regex(/^[a-z0-9._-]+$/, 'Only letters, numbers, dots, dashes and underscores'),
    email: z.email('Enter a valid email address'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
})
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
