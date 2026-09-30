import { NavLink } from 'react-router-dom'

import { adminNavItems, mainNavItems, userNavItems } from '@/config/nav'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ADMIN_ROLES } from '@/types/auth'

function NavLinkItem({ title, url, icon: Icon }: (typeof mainNavItems)[number]) {
  return (
    <NavLink
      to={url}
      end={url === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{title}</span>
    </NavLink>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role ? ADMIN_ROLES.includes(role) : false

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" onClick={onNavigate}>
      <div className="flex flex-col gap-1">
        {mainNavItems.map((item) => (
          <NavLinkItem key={item.url} {...item} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
          Account
        </p>
        {userNavItems.map((item) => (
          <NavLinkItem key={item.url} {...item} />
        ))}
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/50 uppercase">
            Administration
          </p>
          {adminNavItems.map((item) => (
            <NavLinkItem key={item.url} {...item} />
          ))}
        </div>
      )}
    </nav>
  )
}
