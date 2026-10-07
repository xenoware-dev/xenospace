import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Dropdown menu.
 *
 * Closes on outside click, Escape, and scroll of an ancestor — the last one
 * matters because a menu anchored to a row in a scrolling list would otherwise
 * detach and float over unrelated content.
 */

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Draws a separator above this item. */
  separated?: boolean;
}

export function Menu({
  trigger,
  items,
  align = 'end',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        // Focus returns to the trigger, so the keyboard position is not lost.
        triggerRef.current?.focus();
      }
    };
    // Capture phase: a scroll inside a nested container still closes the menu.
    const onScroll = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  // Move focus into the menu when it opens, so the arrows work immediately.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v), ref: triggerRef })}

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            'absolute top-[calc(100%+4px)] z-[var(--z-dropdown)] min-w-44 overflow-hidden p-1',
            'glass-overlay rounded-[var(--radius-lg)]',
            'animate-[xs-rise_var(--duration-fast)_var(--ease-out)]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <div key={index}>
              {item.separated && <div className="my-1 h-px bg-[var(--line-subtle)]" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-xs',
                  'transition-colors duration-[var(--duration-fast)]',
                  'disabled:pointer-events-none disabled:opacity-40',
                  item.tone === 'danger'
                    ? 'text-[var(--status-critical-ink)] hover:bg-[var(--status-critical-wash)]'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--wash-hover)] hover:text-[var(--ink-primary)]',
                )}
              >
                {item.icon && <span className="shrink-0 opacity-70">{item.icon}</span>}
                <span className="flex-1 truncate-line">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Keyboard shortcut hint, e.g. ⌘K. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-[var(--radius-xs)] px-1',
        'bg-[var(--surface-3)] font-sans text-[10px] font-medium text-[var(--ink-muted)]',
        'ring-1 ring-inset ring-[var(--line-subtle)]',
      )}
    >
      {children}
    </kbd>
  );
}

/** Tooltip on hover and focus, positioned above its trigger. */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'right';
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[var(--z-tooltip)] whitespace-nowrap',
          side !== 'right' && 'left-1/2 -translate-x-1/2',
          'glass-overlay rounded-[var(--radius-sm)] px-2 py-1 text-2xs text-[var(--ink-primary)]',
          'opacity-0 transition-opacity duration-[var(--duration-fast)]',
          'group-hover/tip:opacity-100 group-focus-within/tip:opacity-100',
          side === 'top' && 'bottom-[calc(100%+6px)]',
          side === 'bottom' && 'top-[calc(100%+6px)]',
          // Beside the trigger, for the icon rail.
          side === 'right' && 'top-1/2 left-[calc(100%+10px)] -translate-x-0 -translate-y-1/2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
