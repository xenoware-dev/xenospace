import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.js';
import { Counter, type BadgeTone } from './Badge.jsx';

/**
 * Tab bar.
 *
 * Implements the ARIA tabs pattern with arrow-key navigation, so a keyboard
 * user moves between tabs with the arrows and Tab exits the group — which is
 * what the pattern specifies and what screen reader users expect.
 */

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number;
  countTone?: BadgeTone;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    // Wraps at both ends, so the group is a loop rather than a dead stop.
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next) onChange(next.id);
  };

  return (
    <div
      role="tablist"
      className={cn('glass-control inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-[3px]', className)}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            // Only the selected tab is in the tab order; the arrows reach the rest.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap',
              'transition-[background-color,color,border-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-glass)]',
              selected
                ? 'glass-raised text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)]',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <Counter value={tab.count} tone={tab.countTone ?? (selected ? 'accent' : 'neutral')} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Compact segmented control, for switching a view rather than a page section. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'glass-control inline-flex items-center gap-0.5 rounded-full p-[3px]',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
              'transition-[background-color,color,border-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-glass)]',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-sm',
              selected
                ? 'glass-raised text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink-primary)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
