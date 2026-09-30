import { SidebarNav } from '@/components/layout/SidebarNav'
import { UserChip } from '@/components/layout/UserChip'
import { WorkspaceTree } from '@/components/layout/WorkspaceTree'
import { cn } from '@/lib/utils'

/** Panel body, shared by the desktop navigator and the mobile sheet. */
export function NavigatorContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pt-2">
        <UserChip />
      </div>
      <div className="scrollbar-slim flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 py-3">
        <SidebarNav onNavigate={onNavigate} />
        <WorkspaceTree />
      </div>
    </div>
  )
}

export function Sidebar({ open }: { open: boolean }) {
  return (
    <aside
      aria-label="Navigator"
      aria-hidden={!open}
      className={cn(
        'glass text-card-foreground hidden shrink-0 flex-col overflow-hidden rounded-3xl transition-[width,opacity,transform] duration-[var(--motion-view-in)] ease-[var(--ease-glass)] md:flex',
        open
          ? 'w-[264px] translate-x-0 opacity-100'
          : 'pointer-events-none w-0 -translate-x-2 opacity-0'
      )}
    >
      <NavigatorContent />
    </aside>
  )
}
