import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),

  CLIENT_URL: z.url().default('http://localhost:5173'),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().default(30),

  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('Xenospace <no-reply@xenoware.dev>'),

  /** Where uploaded file bytes are written. Relative paths resolve from server/. */
  UPLOAD_DIR: z.string().default('uploads'),
  /** Per-file ceiling enforced by multer before anything touches the disk. */
  MAX_UPLOAD_MB: z.coerce.number().positive().default(25),
  /** How many files one multipart request may carry. */
  MAX_UPLOAD_FILES: z.coerce.number().int().positive().max(50).default(10),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
