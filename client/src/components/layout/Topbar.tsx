import { Menu, Plus, Search } from 'lucide-react'

import { Logo } from '@/components/common/Logo'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { NavigatorContent } from '@/components/layout/Sidebar'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useState } from 'react'

export function Topbar() {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <header className="border-glass-border/60 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-4 md:px-8">
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigator">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="glass-overlay flex w-[280px] flex-col p-0">
          <SheetHeader className="h-14 shrink-0 justify-center px-4">
            <SheetTitle asChild>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <NavigatorContent onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="relative w-full max-w-md">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          placeholder="Search projects, people, files…"
          aria-label="Search Xenospace"
          className="glass-control placeholder:text-muted-foreground focus-visible:ring-ring/40 h-10 w-full rounded-full pr-4 pl-10 text-sm outline-none focus-visible:ring-2"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle className="rounded-full md:hidden" />

        <NotificationBell />

        <Button size="sm" className="ml-1 hidden rounded-full sm:inline-flex">
          <Plus /> New
        </Button>
      </div>
    </header>
  )
}
