import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { RailNav } from '@/components/layout/RailNav'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppLayout() {
  const [navigatorOpen, setNavigatorOpen] = useState(true)

  return (
    <div className="flex h-svh w-full gap-2 overflow-hidden p-2 md:p-3">
      <RailNav
        navigatorOpen={navigatorOpen}
        onToggleNavigator={() => setNavigatorOpen((v) => !v)}
      />
      <Sidebar open={navigatorOpen} />
      <div className="glass text-card-foreground flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        <Topbar />
        <main className="scrollbar-slim flex-1 overflow-y-auto px-4 pt-2 pb-10 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
