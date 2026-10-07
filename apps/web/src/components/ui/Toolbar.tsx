import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn.js';
import { Search, X } from '../icons.jsx';

/**
 * Filter controls.
 *
 * Filters sit in one row above the content, which is where people look for
 * them. Search is debounced internally so a page does not refetch on every
 * keystroke, while the input itself stays fully responsive.
 */

export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Adopt an external reset (e.g. "clear all filters") without fighting typing.
  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (local === value) return;
    const timer = window.setTimeout(() => onChange(local), 220);
    return () => window.clearTimeout(timer);
  }, [local, value, onChange]);

  return (
    <div className={cn('relative flex items-center', className)}>
      <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-[var(--ink-muted)]" />
      <input
        ref={inputRef}
        type="search"
        value={local}
        autoFocus={autoFocus}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(
          'h-8 w-full rounded-[var(--radius-md)] bg-[var(--surface-inset)] pl-8 pr-8 text-xs',
          'ring-1 ring-inset ring-[var(--line-subtle)] transition-[box-shadow]',
          'placeholder:text-[var(--ink-faint)]',
          'hover:ring-[var(--line)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none',
          // The native clear button is suppressed; the styled one below replaces it.
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {local.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setLocal('');
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 rounded-[var(--radius-xs)] p-0.5 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-primary)]"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/** Compact labelled select for a filter row. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T | '';
  options: Array<{ value: T; label: string }>;
  onChange: (next: T | '') => void;
  className?: string;
}) {
  const active = value !== '';
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only-focusable">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T | '')}
        className={cn(
          'h-8 cursor-pointer appearance-none rounded-[var(--radius-md)] pl-2.5 pr-7 text-xs',
          'ring-1 ring-inset transition-[box-shadow,background-color]',
          'focus:ring-2 focus:ring-[var(--accent)] focus:outline-none',
          active
            ? 'bg-[var(--accent-wash)] text-[var(--accent)] ring-[var(--accent)]/30'
            : 'bg-[var(--surface-inset)] text-[var(--ink-secondary)] ring-[var(--line-subtle)] hover:ring-[var(--line)]',
        )}
      >
        <option value="">{label}: All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {label}: {option.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-2.5 text-[var(--ink-muted)]">
        <svg width="8" height="5" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    </label>
  );
}

/** Spacer that pushes the rest of a toolbar to the right. */
export function ToolbarSpacer() {
  return <span className="flex-1" />;
}

/** Clears every active filter at once. */
export function ClearFilters({ onClear, count }: { onClear: () => void; count: number }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-2xs font-medium text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink-primary)]"
    >
      <X size={11} />
      Clear {count} filter{count === 1 ? '' : 's'}
    </button>
  );
}

/** Keyset/offset pagination footer. */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-[var(--line-subtle)] px-1 pt-3"
    >
      <p className="text-2xs text-[var(--ink-muted)] tabular-nums">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-[var(--radius-sm)] px-2 py-1 text-2xs font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--wash-hover)] disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-2 text-2xs text-[var(--ink-muted)] tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-[var(--radius-sm)] px-2 py-1 text-2xs font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--wash-hover)] disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
