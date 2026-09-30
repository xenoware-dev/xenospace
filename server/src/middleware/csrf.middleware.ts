import type { NextFunction, Request, Response } from 'express'

import { env } from '@/config/env'
import { ApiError } from '@/utils/ApiError'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Lightweight CSRF defense for cookie-based auth: since access/refresh tokens
// live in httpOnly, SameSite=Lax cookies (never readable by JS), a forged
// cross-site request can only reach us if the browser also sends a matching
// Origin/Referer. Rejecting mismatches blocks classic CSRF without requiring
// a separate token dance for a same-site SPA.
export function verifyOrigin(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }

  const origin = req.headers.origin ?? req.headers.referer

  if (!origin || !origin.startsWith(env.CLIENT_URL)) {
    throw ApiError.forbidden('Request origin could not be verified')
  }

  next()
}
