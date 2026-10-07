import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn.js';
import { Spinner } from './Spinner.jsx';

/**
 * Button.
 *
 * `loading` keeps the button's width by rendering the spinner in place of the
 * icon rather than replacing the label — a button that changes size mid-click
 * moves whatever is next to it.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] shadow-[var(--shadow-sm)]',
  secondary:
    'glass-tile text-[var(--ink-primary)] hover:bg-[var(--surface-2)]',
  ghost:
    'bg-transparent text-[var(--ink-secondary)] hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]',
  subtle:
    'glass-control text-[var(--ink-primary)] hover:bg-[var(--glass-tile)]',
  danger:
    'bg-[var(--status-critical)] text-white hover:brightness-110 active:brightness-95 shadow-[var(--shadow-sm)]',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-2xs gap-1 rounded-[var(--radius-xs)]',
  sm: 'h-7.5 px-2.5 text-xs gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-md)]',
  lg: 'h-11 px-5 text-base gap-2 rounded-[var(--radius-md)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, iconRight, fullWidth, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      // A loading button must not be clickable twice.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,box-shadow,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        'active:scale-[0.985]',
        'disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'xs' ? 10 : size === 'lg' ? 16 : 13} /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

/** Square button for a lone icon. Requires an accessible label. */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconRight' | 'fullWidth'> {
  label: string;
  children: ReactNode;
}

const ICON_SIZES: Record<ButtonSize, string> = {
  xs: 'size-6 rounded-[var(--radius-xs)]',
  sm: 'size-7.5 rounded-[var(--radius-sm)]',
  md: 'size-9 rounded-[var(--radius-md)]',
  lg: 'size-11 rounded-[var(--radius-md)]',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', label, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        'transition-[background-color,box-shadow,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        'active:scale-[0.94] disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        ICON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={13} /> : children}
    </button>
  );
});

/**
 * Button-styled router link.
 *
 * A real `<a>`, so middle-click, copy-link and open-in-new-tab all work —
 * which they do not when a Link is nested inside a `<button>`.
 */
export interface LinkButtonProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export function LinkButton({
  to, variant = 'secondary', size = 'md', icon, iconRight, fullWidth, className, children,
}: LinkButtonProps) {
  return (
    <Link
      to={to}
      className={cn(
        'relative inline-flex items-center justify-center font-medium whitespace-nowrap select-none',
        'transition-[background-color,box-shadow,color,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        'active:scale-[0.985]',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
    >
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}
