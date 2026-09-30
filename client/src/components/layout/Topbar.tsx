import { Bell, LogOut, Menu, Search, Settings, User as UserIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Logo } from '@/components/common/Logo'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuthStore } from '@/store/auth.store'

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Topbar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="h-14 justify-center border-b">
            <SheetTitle asChild>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <SidebarNav />
        </SheetContent>
      </Sheet>

      <div className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input placeholder="Search Xenospace..." className="pl-8" />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />

        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          <Badge className="absolute top-0.5 right-0.5 size-4 justify-center rounded-full p-0 text-[10px]">
            3
          </Badge>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="ml-1 gap-2 px-1.5">
              <Avatar className="size-7">
                <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name} />
                <AvatarFallback>{user ? initials(user.name) : 'XS'}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user?.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm leading-none font-medium">{user?.name}</p>
              <p className="text-muted-foreground mt-1 text-xs leading-none">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <UserIcon /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
