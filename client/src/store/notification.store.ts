import { create } from 'zustand'

import { connectSocket, disconnectSocket } from '@/lib/socket'
import { notificationApi } from '@/services/notification.service'
import type { AppNotification } from '@/types/notification'

interface NotificationState {
  items: AppNotification[]
  unread: number
  isLoading: boolean
  /** Guards against a second subscription when the provider remounts. */
  isSubscribed: boolean
  fetch: () => Promise<void>
  subscribe: () => void
  unsubscribe: () => void
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  remove: (id: string) => Promise<void>
}

/** The bell only ever shows the most recent few; the page does the rest. */
const BELL_LIMIT = 15

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unread: 0,
  isLoading: false,
  isSubscribed: false,

  fetch: async () => {
    set({ isLoading: true })
    try {
      const { data } = await notificationApi.list({ limit: BELL_LIMIT })
      set({ items: data.items, unread: data.unread })
    } catch {
      // A failed poll leaves whatever is already on screen in place; the
      // socket or the next page load will catch it up.
    } finally {
      set({ isLoading: false })
    }
  },

  subscribe: () => {
    if (get().isSubscribed) return

    const socket = connectSocket()

    socket.on('notification:new', (notification: AppNotification) => {
      set((state) => ({
        // Trimmed here as well as on the server, so a long-lived tab does not
        // grow an unbounded list behind the bell.
        items: [notification, ...state.items].slice(0, BELL_LIMIT),
        unread: state.unread + 1,
      }))
    })

    // The server recomputes the badge after every change, so the count is
    // never derived from counting what happens to be in this tab's list.
    socket.on('notification:count', ({ unread }: { unread: number }) => set({ unread }))

    set({ isSubscribed: true })
  },

  unsubscribe: () => {
    disconnectSocket()
    set({ isSubscribed: false, items: [], unread: 0 })
  },

  markRead: async (id) => {
    const target = get().items.find((item) => item.id === id)
    if (!target || target.isRead) return

    // Moved locally first: a read is reversible and the badge should not lag
    // the click. The socket's count event corrects it either way.
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      unread: Math.max(0, state.unread - 1),
    }))

    try {
      await notificationApi.markRead(id)
    } catch {
      await get().fetch()
    }
  },

  markAllRead: async () => {
    set((state) => ({
      items: state.items.map((item) => ({ ...item, isRead: true })),
      unread: 0,
    }))

    try {
      await notificationApi.markAllRead()
    } catch {
      await get().fetch()
    }
  },

  remove: async (id) => {
    const target = get().items.find((item) => item.id === id)

    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      unread: target && !target.isRead ? Math.max(0, state.unread - 1) : state.unread,
    }))

    try {
      await notificationApi.remove(id)
    } catch {
      await get().fetch()
    }
  },
}))
