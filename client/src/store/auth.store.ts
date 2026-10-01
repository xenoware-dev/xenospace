import { create } from 'zustand'

import { disconnectSocket } from '@/lib/socket'
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

  clearUser: () => {
    // The socket is authenticated from the access-token cookie, so it has to
    // go down with the session — otherwise the next person to sign in on this
    // machine inherits a live connection opened as someone else.
    disconnectSocket()
    set({ user: null, status: 'unauthenticated' })
  },

  fetchCurrentUser: async () => {
    set({ status: 'loading' })
    try {
      const { data } = await authApi.me()
      set({ user: data.user, status: 'authenticated' })
    } catch {
      disconnectSocket()
      set({ user: null, status: 'unauthenticated' })
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } finally {
      disconnectSocket()
      set({ user: null, status: 'unauthenticated' })
    }
  },
}))
