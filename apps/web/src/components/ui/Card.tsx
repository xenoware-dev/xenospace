import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Surface container.
 *
 * Depth comes from the surface ladder plus a hairline, not a drop shadow —
 * shadows stack badly in a dense layout and read as mud on a dark surface.
 */
export function Card({
  children,
  className,
  padded = true,
  interactive = false,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Component
      className={cn(
        // min-w-0: grid and flex children default to min-width:auto, which let
        // wide content push a card past the viewport on a phone.
        'glass-tile min-w-0 rounded-[var(--radius-xl)]',
        padded && 'p-5',
        interactive &&
          'transition-[background-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-glass)] hover:bg-[var(--surface-2)] hover:shadow-[var(--glass-shadow-sm)]',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="truncate-line text-md font-semibold text-[var(--ink-primary)]">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Section divider that spans a card's full width, cancelling its padding. */
export function CardDivider({ className }: { className?: string }) {
  return <div className={cn('-mx-4 my-3 h-px bg-[var(--line-subtle)]', className)} />;
}
