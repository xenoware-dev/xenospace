import { ChevronsUpDown, LogOut, Settings, User as UserIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatRole, getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import type { PresenceStatus } from '@/types/auth'

const presenceColor: Record<PresenceStatus, string> = {
  ONLINE: 'bg-success',
  AWAY: 'bg-warning',
  BUSY: 'bg-destructive',
  OFFLINE: 'bg-muted-foreground',
}

export function UserChip() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-glass-tile flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="relative shrink-0">
            <Avatar className="size-9">
              <AvatarImage src={user?.avatarUrl ?? undefined} alt={user?.name} />
              <AvatarFallback>{user ? getInitials(user.name) : 'XS'}</AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'border-glass-border absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2',
                presenceColor[user?.presenceStatus ?? 'OFFLINE']
              )}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {user?.name ?? 'Signed out'}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {user?.email ?? '—'}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass-overlay w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm leading-none font-medium">{user?.name}</p>
          <p className="text-muted-foreground mt-1 text-xs leading-none">
            {user ? formatRole(user.role) : ''}
            {user?.department ? ` · ${user.department.name}` : ''}
          </p>
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
  )
}
