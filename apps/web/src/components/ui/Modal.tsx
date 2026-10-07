import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn.js';
import { Button, IconButton } from './Button.jsx';
import { X } from '../icons.jsx';

/**
 * Modal dialog.
 *
 * Built on the native `<dialog>` element, which gives focus trapping, inert
 * background and Escape handling from the platform rather than from hand-rolled
 * key listeners that are easy to get subtly wrong.
 */

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  /** Footer actions, right-aligned. */
  footer?: ReactNode;
  /** Set false for a destructive confirm, where a stray click must not dismiss. */
  dismissOnBackdrop?: boolean;
  children: ReactNode;
}

export function Modal({
  open, onClose, title, description, size = 'md', footer, dismissOnBackdrop = true, children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Lock the page behind the dialog so the backdrop does not scroll.
      document.body.style.overflow = 'hidden';
    } else if (!open && dialog.open) {
      dialog.close();
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Escape fires the dialog's cancel event; route it through onClose so the
  // parent's state stays the single source of truth.
  const handleCancel = useCallback(
    (event: React.SyntheticEvent<HTMLDialogElement>) => {
      event.preventDefault();
      onClose();
    },
    [onClose],
  );

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      // A click lands on the dialog element itself only when it hit the
      // backdrop; anything inside the panel stops at the panel.
      if (dismissOnBackdrop && event.target === dialogRef.current) onClose();
    },
    [dismissOnBackdrop, onClose],
  );

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby="xs-modal-title"
      className={cn(
        'fixed inset-0 z-[var(--z-modal)] m-auto w-[calc(100vw-2rem)] bg-transparent p-0',
        'backdrop:bg-[var(--surface-overlay)] backdrop:backdrop-blur-[2px]',
        'open:animate-[xs-fade-in_var(--duration-fast)_var(--ease-out)]',
        SIZES[size],
      )}
    >
      <div
        className={cn(
          'glass-overlay flex max-h-[min(85dvh,48rem)] flex-col overflow-hidden rounded-[var(--radius-2xl)]',
          'animate-[xs-rise_var(--duration)_var(--ease-out)]',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line-subtle)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="xs-modal-title" className="text-lg font-semibold text-[var(--ink-primary)]">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">{description}</p>
            )}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-1">
            <X />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--line-subtle)] bg-[var(--surface-2)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

/** Right-hand drawer, for detail views that keep their list context visible. */
export function Drawer({
  open, onClose, title, description, children, footer, width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!open && dialog.open) {
      dialog.close();
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const widths = { md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

  return createPortal(
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby="xs-drawer-title"
      className={cn(
        'fixed inset-0 z-[var(--z-modal)] m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0',
        'backdrop:bg-[var(--surface-overlay)] backdrop:backdrop-blur-[2px]',
      )}
    >
      <div
        className={cn(
          'glass-overlay ml-auto flex h-full w-full flex-col rounded-l-[var(--radius-2xl)]',
          'animate-[xs-slide-in-right_var(--duration)_var(--ease-out)]',
          widths[width],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line-subtle)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="xs-drawer-title" className="truncate-line text-lg font-semibold">{title}</h2>
            {description && <p className="mt-1 text-xs text-[var(--ink-muted)]">{description}</p>}
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mt-1 -mr-1">
            <X />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-[var(--line-subtle)] bg-[var(--surface-2)] px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>,
    document.body,
  );
}

/**
 * Destructive confirmation.
 *
 * Backdrop dismissal is off and the confirm is not autofocused, so deleting
 * something always takes a deliberate click.
 */
export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-[var(--ink-secondary)]">{message}</p>
    </Modal>
  );
}
