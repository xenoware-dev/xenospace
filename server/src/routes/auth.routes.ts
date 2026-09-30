import { Router } from 'express'

import * as authController from '@/controllers/auth.controller'
import { protect } from '@/middleware/auth.middleware'
import { verifyOrigin } from '@/middleware/csrf.middleware'
import { authLimiter } from '@/middleware/rateLimit.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@/validators/auth.validator'

const router = Router()

router.use(verifyOrigin)

router.post('/register', authLimiter, validate(registerSchema), authController.register)
router.post('/login', authLimiter, validate(loginSchema), authController.login)
router.post('/refresh-token', authController.refreshToken)
router.post('/logout', authController.logout)

router.post('/verify-email', validate(verifyEmailSchema), authController.verifyEmail)
router.post(
  '/resend-verification',
  authLimiter,
  validate(resendVerificationSchema),
  authController.resendVerification
)

router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
)
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword)

router.get('/me', protect, authController.me)
router.post(
  '/change-password',
  protect,
  validate(changePasswordSchema),
  authController.changePassword
)

export default router
