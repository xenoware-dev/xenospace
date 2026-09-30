import bcrypt from 'bcrypt'

import { env } from '@/config/env'
import { User } from '@/models/User.model'
import { sendPasswordResetEmail, sendVerificationEmail } from '@/services/email.service'
import { ApiError } from '@/utils/ApiError'
import { serializeUser } from '@/utils/serialize-user'
import { generateOpaqueToken, hashToken, signAccessToken } from '@/utils/token'

const REFRESH_COOKIE_MAX_AGE_MS = env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000

async function register(input: {
  name: string
  username: string
  email: string
  password: string
}) {
  const existing = await User.findOne({
    $or: [{ email: input.email.toLowerCase() }, { username: input.username.toLowerCase() }],
  })

  if (existing) {
    throw ApiError.conflict(
      existing.email === input.email.toLowerCase()
        ? 'An account with this email already exists'
        : 'This username is already taken'
    )
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

  const { token: verificationToken, tokenHash } = generateOpaqueToken()

  const user = await User.create({
    name: input.name,
    username: input.username.toLowerCase(),
    email: input.email.toLowerCase(),
    password: passwordHash,
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })

  const verifyLink = `${env.CLIENT_URL}/verify-email?token=${verificationToken}`
  await sendVerificationEmail(user.email, user.name, verifyLink)

  return serializeUser(user)
}

async function login(input: { email: string; password: string }) {
  const user = await User.findOne({ email: input.email.toLowerCase() })
    .select('+password')
    .populate('department', 'name')

  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    throw ApiError.unauthorized('Invalid email or password')
  }

  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated. Contact an administrator.')
  }

  const accessToken = signAccessToken({ sub: String(user._id), role: user.role })
  const { token: refreshToken, tokenHash } = generateOpaqueToken()

  user.refreshTokenHash = tokenHash
  user.refreshTokenExpires = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE_MS)
  user.lastLoginAt = new Date()
  user.presenceStatus = 'ONLINE'
  await user.save()

  return { user: serializeUser(user), accessToken, refreshToken }
}

async function refresh(refreshToken: string) {
  const tokenHash = hashToken(refreshToken)
  const user = await User.findOne({
    refreshTokenHash: tokenHash,
    refreshTokenExpires: { $gt: new Date() },
  }).populate('department', 'name')

  if (!user) {
    throw ApiError.unauthorized('Session expired, please sign in again')
  }

  const accessToken = signAccessToken({ sub: String(user._id), role: user.role })
  const { token: newRefreshToken, tokenHash: newTokenHash } = generateOpaqueToken()

  user.refreshTokenHash = newTokenHash
  user.refreshTokenExpires = new Date(Date.now() + REFRESH_COOKIE_MAX_AGE_MS)
  await user.save()

  return { user: serializeUser(user), accessToken, refreshToken: newRefreshToken }
}

async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return

  const tokenHash = hashToken(refreshToken)
  await User.findOneAndUpdate(
    { refreshTokenHash: tokenHash },
    { refreshTokenHash: null, refreshTokenExpires: null, presenceStatus: 'OFFLINE' }
  )
}

async function verifyEmail(token: string) {
  const tokenHash = hashToken(token)
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
  })

  if (!user) {
    throw ApiError.badRequest('Verification link is invalid or has expired')
  }

  user.isEmailVerified = true
  user.emailVerificationTokenHash = null
  user.emailVerificationExpires = null
  await user.save()

  return serializeUser(user)
}

async function resendVerificationEmail(email: string) {
  const user = await User.findOne({ email: email.toLowerCase() })
  if (!user || user.isEmailVerified) return

  const { token: verificationToken, tokenHash } = generateOpaqueToken()
  user.emailVerificationTokenHash = tokenHash
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await user.save()

  const verifyLink = `${env.CLIENT_URL}/verify-email?token=${verificationToken}`
  await sendVerificationEmail(user.email, user.name, verifyLink)
}

async function forgotPassword(email: string) {
  const user = await User.findOne({ email: email.toLowerCase() })
  // Always resolve without error to avoid leaking which emails are registered.
  if (!user) return

  const { token: resetToken, tokenHash } = generateOpaqueToken()
  user.passwordResetTokenHash = tokenHash
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000)
  await user.save()

  const resetLink = `${env.CLIENT_URL}/reset-password?token=${resetToken}`
  await sendPasswordResetEmail(user.email, user.name, resetLink)
}

async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashToken(token)
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  })

  if (!user) {
    throw ApiError.badRequest('Reset link is invalid or has expired')
  }

  user.password = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS)
  user.passwordResetTokenHash = null
  user.passwordResetExpires = null
  // Force re-authentication everywhere after a password reset.
  user.refreshTokenHash = null
  user.refreshTokenExpires = null
  await user.save()
}

async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await User.findById(userId).select('+password')
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    throw ApiError.unauthorized('Current password is incorrect')
  }

  user.password = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS)
  await user.save()
}

export const authService = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  REFRESH_COOKIE_MAX_AGE_MS,
}
