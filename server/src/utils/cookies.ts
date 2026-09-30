import type { Response } from 'express'

import { isProduction } from '@/config/env'
import { authService } from '@/services/auth.service'

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    path: '/',
  })

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: authService.REFRESH_COOKIE_MAX_AGE_MS,
    path: '/api/v1/auth',
  })
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken', { path: '/' })
  res.clearCookie('refreshToken', { path: '/api/v1/auth' })
}
