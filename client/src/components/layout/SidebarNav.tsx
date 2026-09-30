import { NavLink } from 'react-router-dom'

import { adminNavItems, historyNavItems, mainNavGroups, type NavItem } from '@/config/nav'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ADMIN_ROLES } from '@/types/auth'

function NavRow({ title, url, icon: Icon, count }: NavItem) {
  return (
    <NavLink
      to={url}
      end={url === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors',
          isActive
            ? 'glass-raised text-foreground font-semibold'
            : 'text-muted-foreground hover:bg-glass-tile hover:text-foreground font-medium'
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 truncate">{title}</span>
      {count !== undefined && (
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      )}
    </NavLink>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground/70 px-2.5 pb-1 text-[11px] font-semibold tracking-wider uppercase">
      {children}
    </p>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role)
  const isAdmin = role ? ADMIN_ROLES.includes(role) : false

  return (
    <nav className="flex flex-col gap-5" onClick={onNavigate}>
      {mainNavGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <SectionLabel>{group.label}</SectionLabel>
          {group.items.map((item) => (
            <NavRow key={item.url} {...item} />
          ))}
        </div>
      ))}

      <div className="flex flex-col gap-0.5">
        <SectionLabel>History</SectionLabel>
        {historyNavItems.map((item) => (
          <NavRow key={item.title} {...item} />
        ))}
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Administration</SectionLabel>
          {adminNavItems.map((item) => (
            <NavRow key={item.url} {...item} />
          ))}
        </div>
      )}
    </nav>
  )
}
