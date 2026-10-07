import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ROLE_LABEL } from '@xenospace/shared';
import { useAuth } from '@/lib/auth.jsx';
import { cn } from '@/lib/cn.js';
import { indicatorStyle, useActiveIndicator } from '@/hooks/useActiveIndicator.js';
import { useNavBadges } from '@/hooks/useNavBadges.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Menu } from '../ui/Menu.jsx';
import { ChevronsUpDown, Folder, Logout, Plus, Search, Shield, User } from '../icons.jsx';
import { navLabel, visibleSections } from './navigation.js';

const rowBase = cn(
  'relative z-10 flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-sm',
  'transition-[color,background-color] duration-[var(--duration)] ease-[var(--ease-glass)]',
);

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-[var(--ink-muted)]/80 uppercase">
      {children}
    </p>
  );
}

/** The signed-in user, opening the account menu. */
function UserChip() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <Menu
      align="start"
      className="w-full"
      items={[
        { label: 'Profile & settings', icon: <User size={14} />, onSelect: () => navigate('/settings') },
        ...(isAdmin ? [{ label: 'Security audit', icon: <Shield size={14} />, onSelect: () => navigate('/audit') }] : []),
        { label: 'Sign out', icon: <Logout size={14} />, tone: 'danger' as const, separated: true, onSelect: () => void logout() },
      ]}
      trigger={({ toggle, ref, open }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Account menu"
          className="flex w-full items-center gap-2.5 rounded-[var(--radius-lg)] px-2 py-2 text-left transition-colors hover:bg-[var(--glass-tile)]"
        >
          <Avatar user={user} size="lg" showPresence />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate-line text-sm font-semibold">{user.name}</span>
            <span className="block truncate-line text-xs text-[var(--ink-muted)]">{user.email}</span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-[var(--ink-muted)]" />
          <span className="sr-only-focusable">{ROLE_LABEL[user.role]}</span>
        </button>
      )}
    />
  );
}

/** Section links with one glass pill that travels to the current row. */
function SectionNav({ onNavigate }: { onNavigate?: () => void }) {
  const { allows, isAdmin } = useAuth();
  const badges = useNavBadges();
  const { containerRef, box, ready } = useActiveIndicator<HTMLElement>();

  return (
    <nav ref={containerRef} aria-label="Sections" className="relative flex flex-col gap-5" onClick={onNavigate}>
      <span
        aria-hidden="true"
        data-ready={ready}
        data-visible={box !== null}
        className="glass-raised nav-indicator rounded-[var(--radius-md)]"
        style={indicatorStyle(box)}
      />
      {visibleSections(allows, isAdmin).map((section) => (
        <div key={section.id} className="flex flex-col gap-0.5">
          <SectionLabel>{section.title}</SectionLabel>
          {section.items.map((item) => {
            const count = item.badge ? badges[item.badge] : undefined;
            const urgent = item.badge === 'chat' || item.badge === 'notifications' || item.badge === 'reviews';
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    rowBase,
                    isActive
                      ? 'font-semibold text-[var(--ink-primary)] [&>svg]:scale-110'
                      : 'font-medium text-[var(--ink-muted)] hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]',
                  )
                }
              >
                <item.icon size={16} className="transition-transform duration-[var(--duration)] ease-[var(--ease-glass)]" />
                <span className="flex-1 truncate-line">{navLabel(item, isAdmin)}</span>
                {count !== undefined && (count > 0 || item.badge === 'projects' || item.badge === 'tasks') && (
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      urgent && count > 0 ? 'font-semibold text-[var(--data)]' : 'text-[var(--ink-muted)]',
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** The projects the viewer can see, searchable, as a workspace tree. */
function WorkspaceTree({ onNavigate }: { onNavigate?: () => void }) {
  const { allows } = useAuth();
  const { data: projects, isLoading } = useProjectOptions();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();

  const shown = useMemo(
    () => (projects ?? []).filter((p) => !term || p.name.toLowerCase().includes(term) || p.key.toLowerCase().includes(term)),
    [projects, term],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between pr-1">
        <SectionLabel>Workspaces</SectionLabel>
        {allows('project:create') && (
          <Link
            to="/projects?new=1"
            aria-label="New project"
            onClick={onNavigate}
            className="-mt-1 grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]"
          >
            <Plus size={14} />
          </Link>
        )}
      </div>

      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search workspaces"
          aria-label="Search workspaces"
          className="glass-control h-9 w-full rounded-[var(--radius-md)] pr-3 pl-9 text-sm outline-none placeholder:text-[var(--ink-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
        />
      </div>

      <div className="flex flex-col gap-0.5">
        {isLoading ? (
          <p className="px-2.5 py-2 text-xs text-[var(--ink-muted)]">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-[var(--ink-muted)]">
            {term ? 'No matching workspaces.' : 'No projects yet.'}
          </p>
        ) : (
          shown.map((project) => (
            <NavLink
              key={project.id}
              to={`/projects/${project.id}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--glass-tile)] text-[var(--ink-primary)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]',
                )
              }
            >
              <Folder size={14} style={{ color: project.color }} />
              <span className="flex-1 truncate-line">{project.name}</span>
              <span className="text-xs text-[var(--ink-muted)]/80 tabular-nums" title="Open tasks">
                {project.openTasks}
              </span>
            </NavLink>
          ))
        )}
      </div>
    </div>
  );
}

/** Panel body, shared by the desktop navigator and the mobile sheet. */
export function NavigatorContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 pt-2">
        <UserChip />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 py-3">
        <SectionNav onNavigate={onNavigate} />
        <WorkspaceTree onNavigate={onNavigate} />
      </div>
    </div>
  );
}

export function Navigator({ open }: { open: boolean }) {
  return (
    <aside
      aria-label="Navigator"
      aria-hidden={!open}
      // `inert` keeps a collapsed navigator out of the tab order, not just out of sight.
      {...(!open ? { inert: true } : {})}
      className={cn(
        'glass hidden shrink-0 flex-col overflow-hidden rounded-[var(--radius-2xl)] lg:flex',
        'transition-[width,opacity,transform] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]',
        open ? 'w-[var(--sidebar-width)] translate-x-0 opacity-100' : 'pointer-events-none w-0 -translate-x-2 border-0 opacity-0',
      )}
    >
      <NavigatorContent />
    </aside>
  );
}

