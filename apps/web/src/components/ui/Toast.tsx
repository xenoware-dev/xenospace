import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn.js';
import { Check, Info, Warning, X } from '../icons.jsx';
import { IconButton } from './Button.jsx';

/**
 * Transient notifications.
 *
 * Rendered into an `aria-live` region so a success or failure is announced, not
 * just shown — a sighted user sees the toast, everyone else hears it. Errors do
 * not auto-dismiss, because a message you missed is worse than one you have to
 * close.
 */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS: Record<ToastTone, number | null> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  // Errors stay until dismissed.
  error: null,
};

const TONE_STYLE: Record<ToastTone, { ring: string; icon: ReactNode; iconColor: string }> = {
  success: { ring: 'var(--status-good)', icon: <Check size={14} />, iconColor: 'var(--status-good-ink)' },
  error: { ring: 'var(--status-critical)', icon: <Warning size={14} />, iconColor: 'var(--status-critical-ink)' },
  warning: { ring: 'var(--status-warning)', icon: <Warning size={14} />, iconColor: 'var(--status-warning-ink)' },
  info: { ring: 'var(--status-info)', icon: <Info size={14} />, iconColor: 'var(--status-info-ink)' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Cap the stack so a burst of failures cannot cover the whole screen.
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);

      const timeout = AUTO_DISMISS[toast.tone];
      if (timeout !== null) {
        timers.current.set(id, window.setTimeout(() => dismiss(id), timeout));
      }
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, message) => show({ tone: 'success', title, message }),
      error: (title, message) => show({ tone: 'error', title, message }),
      info: (title, message) => show({ tone: 'info', title, message }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          // Assertive for errors would interrupt; polite is right for a queue
          // the user can also see.
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed right-4 bottom-4 z-[var(--z-toast)] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        >
          {toasts.map((toast) => {
            const style = TONE_STYLE[toast.tone];
            return (
              <div
                key={toast.id}
                role={toast.tone === 'error' ? 'alert' : 'status'}
                className={cn(
                  'glass-overlay pointer-events-auto flex items-start gap-3 rounded-[var(--radius-lg)] p-3',
                  'animate-[xs-slide-in-right_var(--duration)_var(--ease-out)]',
                )}
                // A left accent band carries the tone without colouring the text.
                style={{ borderLeft: `3px solid ${style.ring}` }}
              >
                <span aria-hidden="true" className="mt-0.5" style={{ color: style.iconColor }}>
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--ink-primary)]">{toast.title}</p>
                  {toast.message && (
                    <p className="mt-0.5 text-2xs leading-relaxed text-[var(--ink-secondary)]">{toast.message}</p>
                  )}
                  {toast.action && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action!.onClick();
                        dismiss(toast.id);
                      }}
                      className="mt-1.5 text-2xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>
                <IconButton label="Dismiss" size="xs" onClick={() => dismiss(toast.id)} className="-mt-0.5 -mr-0.5">
                  <X size={12} />
                </IconButton>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
