import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CursorPage, Notification } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { useSocket } from '@/lib/socket.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/cn.js';
import { keys, queryClient } from '@/lib/queryClient.js';
import { relativeTime } from '@/lib/format.js';
import { Avatar } from '../ui/Avatar.jsx';
import { Kbd, Menu, type MenuItem } from '../ui/Menu.jsx';
import {
  Bell, Bug, Calendar, Knowledge, Menu as MenuIcon, Moon, Plus, Projects, Search, Sun, Tasks,
} from '../icons.jsx';

/**
 * Header inside the content panel: search, notifications and the create menu —
 * the three things that must be reachable from every page.
 */
export function Topbar({ onOpenSidebar, onOpenPalette }: { onOpenSidebar: () => void; onOpenPalette: () => void }) {
  const { allows } = useAuth();
  const { connected } = useSocket();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: keys.unreadCount,
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });

  const { data: recent } = useQuery({
    queryKey: keys.notifications({ limit: 8 }),
    queryFn: () => api.get<CursorPage<Notification>>('/notifications', { limit: 8 }),
    enabled: panelOpen,
  });

  useEffect(() => {
    if (!panelOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelOpen]);

  const markAllRead = async () => {
    await api.post('/notifications/read', { all: true });
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  // "New" offers only what the signed-in role can actually create.
  const createItems: MenuItem[] = [
    ...(allows('task:create') ? [{ label: 'Task', icon: <Tasks size={14} />, onSelect: () => navigate('/tasks?new=1') }] : []),
    ...(allows('project:create') ? [{ label: 'Project', icon: <Projects size={14} />, onSelect: () => navigate('/projects?new=1') }] : []),
    ...(allows('issue:create') ? [{ label: 'Issue', icon: <Bug size={14} />, onSelect: () => navigate('/issues?new=1') }] : []),
    ...(allows('kb:create') ? [{ label: 'Note', icon: <Knowledge size={14} />, onSelect: () => navigate('/knowledge?new=1') }] : []),
    ...(allows('calendar:create') ? [{ label: 'Event', icon: <Calendar size={14} />, onSelect: () => navigate('/calendar?new=1') }] : []),
  ];

  const count = unread?.unread ?? 0;

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 shrink-0 items-center gap-2 border-b border-[var(--glass-border)]/60 px-4 md:px-8">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigator"
        className="grid size-9 place-items-center rounded-[var(--radius-md)] text-[var(--ink-muted)] hover:bg-[var(--glass-tile)] lg:hidden"
      >
        <MenuIcon size={18} />
      </button>

      {/* Looks like a field, opens the palette: one search for the whole app. */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="glass-control group relative flex h-10 w-full max-w-md min-w-0 items-center gap-2.5 rounded-full pr-3 pl-3.5 text-left"
      >
        <Search size={16} className="shrink-0 text-[var(--ink-muted)]" />
        <span className="min-w-0 flex-1 truncate-line text-sm text-[var(--ink-muted)]">Search<span className="hidden sm:inline"> projects, people, files</span>…</span>
        <span className="hidden shrink-0 items-center gap-0.5 opacity-70 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {!connected && (
          <span role="status" className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-2xs text-[var(--status-warning-ink)] sm:flex">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--status-warning)]" />
            Reconnecting
          </span>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          className="grid size-9 place-items-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)] lg:hidden"
        >
          {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            aria-expanded={panelOpen}
            aria-label={count ? `Notifications (${count} unread)` : 'Notifications'}
            className="relative grid size-9 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]"
          >
            <Bell size={17} />
            {count > 0 && (
              <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-[var(--data)] ring-2 ring-[var(--surface-page)]" />
            )}
          </button>

          {panelOpen && (
            <>
              <div className="fixed inset-0 z-[var(--z-overlay)]" onClick={() => setPanelOpen(false)} aria-hidden="true" />
              <div className="glass-overlay absolute right-0 z-[var(--z-dropdown)] mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-xl)] animate-[xs-rise_var(--duration)_var(--ease-glass)]">
                <div className="flex items-center justify-between border-b border-[var(--line-subtle)] px-4 py-3">
                  <h2 className="text-sm font-semibold">Notifications</h2>
                  {count > 0 && (
                    <button type="button" onClick={markAllRead} className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink-primary)]">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {!recent ? (
                    <p className="px-4 py-8 text-center text-xs text-[var(--ink-muted)]">Loading…</p>
                  ) : recent.items.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-[var(--ink-muted)]">You are all caught up.</p>
                  ) : (
                    <ul>
                      {recent.items.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPanelOpen(false);
                              if (n.link) navigate(n.link);
                            }}
                            className={cn(
                              'flex w-full gap-3 border-b border-[var(--line-subtle)] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[var(--glass-tile)]',
                              !n.readAt && 'bg-[var(--glass-tile)]',
                            )}
                          >
                            {n.actor ? <Avatar user={n.actor} size="sm" /> : <Bell size={14} className="mt-1 text-[var(--ink-muted)]" />}
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-medium">{n.title}</span>
                              {n.body && <span className="mt-0.5 block line-clamp-2 text-2xs text-[var(--ink-muted)]">{n.body}</span>}
                              <span className="mt-1 block text-2xs text-[var(--ink-faint)]">{relativeTime(n.createdAt)}</span>
                            </span>
                            {!n.readAt && <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--data)]" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Link
                  to="/notifications"
                  onClick={() => setPanelOpen(false)}
                  className="block border-t border-[var(--line-subtle)] px-4 py-2.5 text-center text-xs text-[var(--ink-muted)] hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]"
                >
                  View all notifications
                </Link>
              </div>
            </>
          )}
        </div>

        {createItems.length > 0 && (
          <Menu
            items={createItems}
            trigger={({ toggle: toggleMenu, ref, open }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggleMenu}
                aria-expanded={open}
                className="ml-1 hidden h-8 items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-ink)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--accent-hover)] sm:inline-flex"
              >
                <Plus size={15} />
                New
              </button>
            )}
          />
        )}
      </div>
    </header>
  );
}
