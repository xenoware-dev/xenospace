import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Data table.
 *
 * A real `<table>`, not a grid of divs: screen readers announce row and column
 * relationships, and a user can navigate it cell by cell. The sticky header is
 * CSS only, so it works inside any scroll container.
 */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Right-align numbers so magnitudes compare down the column. */
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Hidden below the given breakpoint rather than truncated. */
  hideBelow?: 'sm' | 'md' | 'lg';
  sortable?: boolean;
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sort?: { key: string; order: 'asc' | 'desc' };
  onSortChange?: (key: string) => void;
  empty?: ReactNode;
  className?: string;
}

const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
} as const;

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

export function Table<T>({
  columns, rows, rowKey, onRowClick, sort, onSortChange, empty, className,
}: TableProps<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--line)]">
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'bg-[var(--surface-1)] px-3 py-2.5 text-xs font-medium text-[var(--ink-muted)]',
                    'sticky top-0 z-[var(--z-sticky)]',
                    ALIGN[column.align ?? 'left'],
                    column.hideBelow && HIDE_BELOW[column.hideBelow],
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-[var(--ink-primary)]',
                        active && 'text-[var(--ink-primary)]',
                      )}
                    >
                      {column.header}
                      <span aria-hidden="true" className={cn('text-[8px]', !active && 'opacity-30')}>
                        {active && sort.order === 'asc' ? '▲' : '▼'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              // A clickable row is a real button for the keyboard, without
              // nesting interactive elements inside a cell.
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                'border-b border-[var(--line-subtle)] transition-colors duration-[var(--duration-fast)]',
                'last:border-0',
                onRowClick && 'cursor-pointer hover:bg-[var(--wash-hover)] focus-visible:bg-[var(--wash-hover)]',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 py-[var(--row-padding-y)] align-middle text-[var(--ink-secondary)]',
                    ALIGN[column.align ?? 'left'],
                    column.hideBelow && HIDE_BELOW[column.hideBelow],
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
