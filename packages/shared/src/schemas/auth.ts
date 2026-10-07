import { z } from 'zod';
import { ROLES } from '../rbac.js';
import { text, uuid } from './common.js';

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(254)
  .email('Enter a valid email address');

/**
 * Password policy. Length is the dominant factor in resisting offline cracking,
 * so the floor is 12 rather than the customary 8, and the 200-char ceiling
 * bounds Argon2 work per request (an unbounded password is a cheap DoS).
 */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

export const password = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${PASSWORD_MAX} characters`)
  .refine((v) => /[a-z]/.test(v), { message: 'Include a lowercase letter' })
  .refine((v) => /[A-Z]/.test(v), { message: 'Include an uppercase letter' })
  .refine((v) => /[0-9]/.test(v), { message: 'Include a number' })
  .refine((v) => /[^A-Za-z0-9]/.test(v), { message: 'Include a symbol' })
  .refine((v) => !/(.)\1{3,}/.test(v), { message: 'Avoid repeating a character four or more times' });

/** Scores a password 0-4 for the strength meter. Mirrors the rules above. */
export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; hints: string[] } {
  const hints: string[] = [];
  let score = 0;
  if (value.length >= PASSWORD_MIN) score++; else hints.push(`At least ${PASSWORD_MIN} characters`);
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++; else hints.push('Mix upper and lower case');
  if (/[0-9]/.test(value)) score++; else hints.push('Add a number');
  if (/[^A-Za-z0-9]/.test(value)) score++; else hints.push('Add a symbol');
  if (value.length >= 16 && score === 4) score = 4;
  else if (score === 4 && value.length < 16) { score = 3; hints.push('16+ characters is stronger'); }
  return { score: score as 0 | 1 | 2 | 3 | 4, hints };
}

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX),
  /** Opt into a long-lived refresh cookie on a trusted device. */
  rememberMe: z.boolean().optional().default(false),
  /** TOTP code, required only once the account has 2FA enrolled. */
  totp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code').optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: text(2, 80, 'Name'),
    email,
    password,
    confirmPassword: z.string(),
    /**
     * Self-service signup always yields a DEVELOPER. The first account in an
     * empty workspace is promoted to ADMIN by the server, and an explicit role
     * is only honoured on an invite-backed registration.
     */
    inviteToken: z.string().min(16).max(256).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const refreshSchema = z.object({
  /** Omitted when the refresh token travels in its httpOnly cookie. */
  refreshToken: z.string().min(16).max(1024).optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16).max(256),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => d.currentPassword !== d.password, {
    message: 'New password must differ from the current one',
    path: ['password'],
  });

export const inviteSchema = z.object({
  email,
  role: z.enum(ROLES),
  name: text(2, 80, 'Name').optional(),
  projectIds: z.array(uuid).max(50).optional(),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(16).max(256),
    name: text(2, 80, 'Name'),
    password,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** OAuth state echoed back from the provider; `next` is validated as a safe path. */
export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(512),
});

export const revokeSessionSchema = z.object({ sessionId: uuid });
