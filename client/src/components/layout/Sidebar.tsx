import { Logo } from '@/components/common/Logo'
import { SidebarNav } from '@/components/layout/SidebarNav'

export function Sidebar() {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-64 shrink-0 flex-col border-r md:flex">
      <div className="border-sidebar-border flex h-14 items-center border-b px-4">
        <Logo />
      </div>
      <SidebarNav />
    </aside>
  )
}
