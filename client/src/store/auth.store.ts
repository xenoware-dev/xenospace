import { create } from 'zustand'

import { authApi } from '@/services/auth.service'
import type { User } from '@/types/auth'

interface AuthState {
  user: User | null
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'
  setUser: (user: User) => void
  clearUser: () => void
  fetchCurrentUser: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  setUser: (user) => set({ user, status: 'authenticated' }),

  clearUser: () => set({ user: null, status: 'unauthenticated' }),

  fetchCurrentUser: async () => {
    set({ status: 'loading' })
    try {
      const { data } = await authApi.me()
      set({ user: data.user, status: 'authenticated' })
    } catch {
      set({ user: null, status: 'unauthenticated' })
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      set({ user: null, status: 'unauthenticated' })
    }
  },
}))
