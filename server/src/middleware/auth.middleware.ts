import type { NextFunction, Request, Response } from 'express'

import { User } from '@/models/User.model'
import type { Role } from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { catchAsync } from '@/utils/catchAsync'
import { verifyAccessToken } from '@/utils/token'

// Verifies the access token and loads the current user from the database
// on every request, so a role change or deactivation takes effect immediately
// instead of trusting stale claims baked into the JWT.
export const protect = catchAsync(async (req: Request, _res: Response, next: NextFunction) => {
  const token =
    req.cookies?.accessToken ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined)

  if (!token) {
    throw ApiError.unauthorized('Authentication required')
  }

  let payload
  try {
    payload = verifyAccessToken(token)
  } catch {
    throw ApiError.unauthorized('Session expired, please sign in again')
  }

  const user = await User.findById(payload.sub).populate('department', 'name')
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Account not found or deactivated')
  }

  req.user = user
  next()
})

// Restricts a route to a fixed set of roles. SUPER_ADMIN always has access.
export const authorize =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw ApiError.unauthorized('Authentication required')
    }

    if (req.user.role === 'SUPER_ADMIN' || roles.includes(req.user.role)) {
      next()
      return
    }

    throw ApiError.forbidden('You do not have permission to perform this action')
  }
