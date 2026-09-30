import crypto from 'node:crypto'

import jwt, { type SignOptions } from 'jsonwebtoken'

import { env } from '@/config/env'
import type { Role } from '@/types/enums'

export interface AccessTokenPayload {
  sub: string
  role: Role
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
  } as SignOptions)
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload & {
    iat: number
    exp: number
  }
}

// Refresh tokens are opaque random strings (not JWTs) hashed with SHA-256
// before persisting, so a leaked database never exposes usable tokens.
export function generateOpaqueToken() {
  const token = crypto.randomBytes(48).toString('hex')
  const tokenHash = hashToken(token)
  return { token, tokenHash }
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}
