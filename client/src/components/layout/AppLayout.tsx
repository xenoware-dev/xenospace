import { useRef, useState } from 'react'

import { RailNav } from '@/components/layout/RailNav'
import { RouteTransition } from '@/components/layout/RouteTransition'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

export function AppLayout() {
  const [navigatorOpen, setNavigatorOpen] = useState(true)
  const mainRef = useRef<HTMLElement>(null)

  return (
    <div className="flex h-svh w-full gap-2 overflow-hidden p-2 md:p-3">
      <RailNav
        navigatorOpen={navigatorOpen}
        onToggleNavigator={() => setNavigatorOpen((v) => !v)}
      />
      <Sidebar open={navigatorOpen} />
      <div className="glass text-card-foreground flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        <Topbar />
        <main
          ref={mainRef}
          className="scrollbar-slim flex-1 overflow-y-auto px-4 pt-2 pb-10 md:px-8"
        >
          <RouteTransition scrollRef={mainRef} />
        </main>
      </div>
    </div>
  )
}
