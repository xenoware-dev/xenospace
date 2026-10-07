import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn.js';
import { useHotkey } from '@/lib/theme.jsx';
import { Rail } from './Rail.jsx';
import { Navigator, NavigatorContent } from './Navigator.jsx';
import { Topbar } from './Topbar.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { RouteTransition } from './RouteTransition.jsx';

/**
 * Authenticated layout: three floating glass panels on a black canvas — the
 * icon rail, the collapsible navigator, and the content panel.
 */
export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(() => {
    try {
      return localStorage.getItem('xs-navigator') !== 'closed';
    } catch {
      return true;
    }
  });

  useHotkey({ key: 'k', meta: true }, () => setPaletteOpen(true));
  useHotkey({ key: '/' }, () => setPaletteOpen(true));
  // ⌘\\ toggles the navigator, as in most editors.
  useHotkey({ key: '\\', meta: true }, () => setNavigatorOpen((v) => !v));

  useEffect(() => {
    try {
      localStorage.setItem('xs-navigator', navigatorOpen ? 'open' : 'closed');
    } catch {
      /* session-only when storage is unavailable */
    }
  }, [navigatorOpen]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="flex h-dvh w-full gap-2 overflow-hidden p-2 md:p-3">
      <a
        href="#main"
        className="sr-only-focusable focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:rounded-[var(--radius-md)] focus:bg-[var(--accent)] focus:px-3 focus:py-1.5 focus:text-xs focus:text-[var(--accent-ink)]"
      >
        Skip to content
      </a>

      <Rail navigatorOpen={navigatorOpen} onToggleNavigator={() => setNavigatorOpen((v) => !v)} />
      <Navigator open={navigatorOpen} />

      {mobileOpen && (
        <div className="fixed inset-0 z-[var(--z-overlay)] lg:hidden">
          <div className="absolute inset-0 bg-[var(--surface-overlay)] backdrop-blur-sm xs-animate-fade" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside
            aria-label="Navigator"
            className="glass-overlay absolute inset-y-2 left-2 flex w-[min(19rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[var(--radius-2xl)] animate-[xs-slide-in-right_var(--duration)_var(--ease-glass)]"
          >
            <NavigatorContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-2xl)]">
        <Topbar onOpenSidebar={() => setMobileOpen(true)} onOpenPalette={() => setPaletteOpen(true)} />
        <main id="main" ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
          <RouteTransition scrollRef={mainRef} />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/**
 * Page frame. Large title, quiet description, actions on the right, filters in
 * one row beneath — the same anatomy on every page.
 */
export function Page({
  title,
  description,
  actions,
  toolbar,
  children,
  className,
  fullBleed = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  /** For a board or canvas that fills the panel and scrolls internally. */
  fullBleed?: boolean;
}) {
  return (
    <div
      className={cn(
        fullBleed ? 'flex h-full min-h-0 flex-col' : 'mx-auto w-full max-w-[var(--content-max)] px-4 pt-5 pb-10 md:px-8',
        className,
      )}
    >
      <header
        className={cn(
          'flex flex-col justify-between gap-3 sm:flex-row sm:items-end',
          fullBleed && 'shrink-0 px-4 pt-5 md:px-8',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-[var(--ink-primary)] md:text-4xl">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-[var(--ink-muted)]">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {toolbar && (
        <div className={cn('flex flex-wrap items-center gap-2', fullBleed ? 'shrink-0 px-4 pt-5 pb-1 md:px-8' : 'mt-6')}>
          {toolbar}
        </div>
      )}

      <div className={cn(fullBleed ? 'min-h-0 flex-1 overflow-hidden' : 'mt-6')}>{children}</div>
    </div>
  );
}
