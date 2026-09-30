import { api } from '@/lib/axios'
import type { ApiEnvelope, User } from '@/types/auth'

export interface RegisterPayload {
  name: string
  username: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    api.post<ApiEnvelope<{ user: User }>>('/auth/register', payload).then((r) => r.data),

  login: (payload: LoginPayload) =>
    api.post<ApiEnvelope<{ user: User }>>('/auth/login', payload).then((r) => r.data),

  logout: () => api.post<ApiEnvelope<null>>('/auth/logout').then((r) => r.data),

  me: () => api.get<ApiEnvelope<{ user: User }>>('/auth/me').then((r) => r.data),

  verifyEmail: (token: string) =>
    api.post<ApiEnvelope<{ user: User }>>('/auth/verify-email', { token }).then((r) => r.data),

  resendVerification: (email: string) =>
    api.post<ApiEnvelope<null>>('/auth/resend-verification', { email }).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<ApiEnvelope<null>>('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    api.post<ApiEnvelope<null>>('/auth/reset-password', { token, password }).then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    api
      .post<ApiEnvelope<null>>('/auth/change-password', { currentPassword, newPassword })
      .then((r) => r.data),
}
