import type { Request, Response } from 'express'

import { authService } from '@/services/auth.service'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'
import { clearAuthCookies, setAuthCookies } from '@/utils/cookies'
import { serializeUser } from '@/utils/serialize-user'

export const register = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.register(req.body)
  ApiResponse.send(
    res,
    201,
    'Account created. Please check your email to verify your account.',
    { user }
  )
})

export const login = catchAsync(async (req: Request, res: Response) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body)
  setAuthCookies(res, accessToken, refreshToken)
  ApiResponse.send(res, 200, 'Logged in successfully', { user })
})

export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const incoming = req.cookies?.refreshToken
  if (!incoming) {
    ApiResponse.send(res, 401, 'Session expired, please sign in again')
    return
  }

  const { user, accessToken, refreshToken: newRefreshToken } = await authService.refresh(incoming)
  setAuthCookies(res, accessToken, newRefreshToken)
  ApiResponse.send(res, 200, 'Session refreshed', { user })
})

export const logout = catchAsync(async (req: Request, res: Response) => {
  await authService.logout(req.cookies?.refreshToken)
  clearAuthCookies(res)
  ApiResponse.send(res, 200, 'Logged out successfully')
})

export const me = catchAsync(async (req: Request, res: Response) => {
  ApiResponse.send(res, 200, 'Current user', { user: serializeUser(req.user!) })
})

export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const user = await authService.verifyEmail(req.body.token)
  ApiResponse.send(res, 200, 'Email verified successfully', { user })
})

export const resendVerification = catchAsync(async (req: Request, res: Response) => {
  await authService.resendVerificationEmail(req.body.email)
  ApiResponse.send(res, 200, 'If an account exists, a verification email has been sent')
})

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email)
  ApiResponse.send(res, 200, 'If an account exists, a password reset email has been sent')
})

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password)
  ApiResponse.send(res, 200, 'Password reset successfully. Please sign in again.')
})

export const changePassword = catchAsync(async (req: Request, res: Response) => {
  await authService.changePassword(String(req.user!._id), req.body.currentPassword, req.body.newPassword)
  ApiResponse.send(res, 200, 'Password changed successfully')
})
