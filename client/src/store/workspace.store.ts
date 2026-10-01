import { create } from 'zustand'

import { dashboardApi } from '@/services/dashboard.service'
import type { DashboardOverview } from '@/types/dashboard'

interface WorkspaceState {
  overview: DashboardOverview | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  load: () => Promise<void>
  clear: () => void
}

/**
 * One fetch behind three surfaces: the dashboard, the sidebar counts and the
 * navigator tree. Pages that change projects or tasks call `load()` again so the
 * badges never drift from what the board actually holds.
 */
export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  overview: null,
  status: 'idle',

  load: async () => {
    // A refresh keeps the previous numbers on screen rather than flashing empty.
    if (get().status !== 'loading') {
      set({ status: 'loading' })
    }

    try {
      const { data } = await dashboardApi.overview()
      set({ overview: data, status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },

  clear: () => set({ overview: null, status: 'idle' }),
}))
