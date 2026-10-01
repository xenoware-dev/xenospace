import { NavLink } from 'react-router-dom'

import {
  adminNavItems,
  historyNavItems,
  mainNavGroups,
  ROLE_GATED_GROUPS,
  type NavItem,
} from '@/config/nav'
import { useActiveIndicator } from '@/hooks/use-active-indicator'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import { ADMIN_ROLES } from '@/types/auth'

function NavRow({ title, url, icon: Icon, count }: NavItem & { count?: number }) {
  return (
    <NavLink
      to={url}
      end={url === '/'}
      className={({ isActive }) =>
        cn(
          'relative z-10 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-[color,background-color] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
          isActive
            ? 'text-foreground font-semibold [&>svg]:scale-110'
            : 'text-muted-foreground hover:bg-glass-tile hover:text-foreground font-medium'
        )
      }
    >
      <Icon className="size-4 shrink-0 transition-transform duration-[var(--motion-control)] ease-[var(--ease-glass)]" />
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
  const { containerRef, box, ready } = useActiveIndicator<HTMLElement>()
  const counts = useWorkspaceStore((s) => s.overview?.counts)

  // Only the sections backed by real data carry a badge; the rest stay bare
  // until those features exist, rather than showing an invented number.
  const countFor = (url: string) => {
    if (!counts) return undefined
    if (url === '/projects') return counts.projects
    if (url === '/tasks') return counts.tasks
    return undefined
  }

  return (
    <nav ref={containerRef} className="relative flex flex-col gap-5" onClick={onNavigate}>
      {/* One pill that travels to whichever row is current. */}
      <span
        aria-hidden
        data-ready={ready}
        data-visible={box !== null}
        className="glass-raised nav-indicator rounded-xl"
        style={{
          transform: `translate3d(${box?.left ?? 0}px, ${box?.top ?? 0}px, 0)`,
          width: box?.width ?? 0,
          height: box?.height ?? 0,
          top: 0,
          left: 0,
        }}
      />

      {mainNavGroups.map((group) => {
        // A group nobody in this role can use is left out entirely rather
        // than shown as rows that refuse on click.
        const allowed = ROLE_GATED_GROUPS[group.label]
        if (allowed && (!role || !allowed.includes(role))) return null

        return (
        <div key={group.label} className="flex flex-col gap-0.5">
          <SectionLabel>{group.label}</SectionLabel>
          {group.items.map((item) => (
            <NavRow key={item.url} {...item} count={countFor(item.url)} />
          ))}
        </div>
        )
      })}

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
