import {
  forwardRef, useId, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Form controls.
 *
 * Every control is wired to its label and error through generated ids, and an
 * error sets `aria-invalid` plus `aria-describedby`. Validation messages are
 * therefore announced rather than merely coloured red.
 */

const CONTROL_BASE = cn(
  'glass-control w-full rounded-[var(--radius-md)] px-3 text-[var(--ink-primary)]',
  'transition-[box-shadow,background-color] duration-[var(--duration-fast)]',
  'placeholder:text-[var(--ink-muted)]',
  'focus:bg-[var(--glass-tile)] focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

const INVALID = 'ring-1 ring-inset ring-[var(--status-critical)] focus:ring-2 focus:ring-[var(--status-critical)]';

export interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Right-aligned content in the label row, e.g. a character counter. */
  aside?: ReactNode;
  className?: string;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

export function Field({ label, hint, error, required, aside, className, children }: FieldShellProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  // The error takes precedence in the description, so a screen reader hears the
  // problem rather than the hint it replaces.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={inputId} className="text-xs font-medium text-[var(--ink-secondary)]">
              {label}
              {required && (
                <span aria-hidden="true" className="ml-0.5 text-[var(--status-critical-ink)]">*</span>
              )}
            </label>
          )}
          {aside && <span className="text-2xs text-[var(--ink-faint)] tabular-nums">{aside}</span>}
        </div>
      )}

      {children({ inputId, describedBy })}

      {error ? (
        <p id={errorId} role="alert" className="flex items-start gap-1 text-2xs text-[var(--status-critical-ink)]">
          <span aria-hidden="true" className="mt-px">⚠</span>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-2xs text-[var(--ink-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------------- input */

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  aside?: ReactNode;
  icon?: ReactNode;
  iconRight?: ReactNode;
  wrapperClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, aside, icon, iconRight, wrapperClassName, className, required, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} aside={aside} required={required} className={wrapperClassName}>
      {({ inputId, describedBy }) => (
        <div className="relative flex items-center">
          {icon && (
            <span aria-hidden="true" className="pointer-events-none absolute left-3 text-[var(--ink-muted)]">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              CONTROL_BASE, 'h-9 text-sm',
              icon && 'pl-9',
              iconRight && 'pr-9',
              error && INVALID,
              className,
            )}
            {...rest}
          />
          {iconRight && <span className="absolute right-2.5 flex items-center">{iconRight}</span>}
        </div>
      )}
    </Field>
  );
});

/* ------------------------------------------------------------------ textarea */

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  aside?: ReactNode;
  wrapperClassName?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, aside, wrapperClassName, className, required, rows = 4, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} aside={aside} required={required} className={wrapperClassName}>
      {({ inputId, describedBy }) => (
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(CONTROL_BASE, 'resize-y py-2 text-sm leading-relaxed', error && INVALID, className)}
          {...rest}
        />
      )}
    </Field>
  );
});

/* -------------------------------------------------------------------- select */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  wrapperClassName?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, wrapperClassName, className, required, children, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      {({ inputId, describedBy }) => (
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              CONTROL_BASE,
              'h-9 cursor-pointer appearance-none pr-8 text-sm',
              error && INVALID,
              className,
            )}
            {...rest}
          >
            {children}
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[var(--ink-muted)]"
          >
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      )}
    </Field>
  );
});

/* ------------------------------------------------------------------ checkbox */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  hint?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className, ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer appearance-none rounded-[var(--radius-xs)]',
          'bg-[var(--surface-1)] ring-1 ring-inset ring-[var(--line-strong)]',
          'transition-[background-color,box-shadow] duration-[var(--duration-fast)]',
          'checked:bg-[var(--accent)] checked:ring-[var(--accent)]',
          // The tick is drawn as a background image so no extra element is
          // needed and the control stays a real checkbox for assistive tech.
          'checked:bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20viewBox%3D%270%200%2012%2012%27%20fill%3D%27none%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cpath%20d%3D%27M2.5%206.2L4.6%208.3L9.5%203.5%27%20stroke%3D%27white%27%20stroke-width%3D%271.8%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%2F%3E%3C%2Fsvg%3E")] checked:bg-center checked:bg-no-repeat',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        {...rest}
      />
      <label htmlFor={id} className="cursor-pointer select-none text-xs leading-snug">
        <span className="font-medium text-[var(--ink-primary)]">{label}</span>
        {hint && <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">{hint}</span>}
      </label>
    </div>
  );
});

/** Switch for an immediate, self-saving preference. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-xs font-medium text-[var(--ink-primary)]">{label}</span>
        {hint && <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-[var(--radius-full)]',
          'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-3)] ring-1 ring-inset ring-[var(--line)]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow-[var(--shadow-sm)]',
            'transition-[left] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
            checked ? 'left-[1.125rem]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}
