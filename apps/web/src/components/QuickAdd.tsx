import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn.js';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Plus, SlidersHorizontal, X } from '@/components/icons.jsx';

/** The API's minimum title length; shorter input keeps the submit disabled. */
const MIN_TITLE = 3;

/**
 * One-line task capture: type a title, press Enter, keep typing.
 *
 * The details button opens the full form with whatever was typed carried over,
 * so starting quick never costs the title when it turns out to need more.
 */
export function QuickAddTask({
  onAdd,
  onOpenDetails,
  placeholder = 'Add a task and press Enter…',
  disabled,
  className,
}: {
  /** Resolves once the task exists; rejects to keep the text for a retry. */
  onAdd: (title: string) => Promise<unknown>;
  onOpenDetails: (title: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  const submit = async () => {
    if (trimmed.length < MIN_TITLE || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } catch {
      // useMutate already toasted; leave the text so nothing is lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className={cn('flex items-center gap-2', className)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="relative flex-1">
        <Plus
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--ink-muted)]"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={placeholder}
          aria-label="New task title"
          maxLength={200}
          disabled={disabled}
          className={cn(
            'glass-control h-10 w-full rounded-full pr-4 pl-10 text-sm text-[var(--ink-primary)]',
            'placeholder:text-[var(--ink-muted)] focus:bg-[var(--glass-tile)] focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      </div>
      <IconButton
        label="Add with details"
        variant="subtle"
        size="md"
        className="size-10 rounded-full"
        disabled={disabled}
        onClick={() => onOpenDetails(trimmed)}
      >
        <SlidersHorizontal size={15} />
      </IconButton>
      <Button
        type="submit"
        variant="primary"
        className="h-10 rounded-full px-5"
        loading={saving}
        disabled={disabled || trimmed.length < MIN_TITLE}
      >
        Add
      </Button>
    </form>
  );
}

/**
 * Trello's inline card composer.
 *
 * The trigger turns into a textarea; Enter saves and stays open for the next
 * card, Shift+Enter is a newline-free no-op, Escape or an empty blur closes.
 */
export function CardComposer({
  onAdd,
  label = 'Add a card',
  className,
}: {
  onAdd: (title: string) => Promise<unknown>;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = title.trim();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setTitle('');
    setOpen(false);
  };

  const submit = async () => {
    if (trimmed.length < MIN_TITLE || saving) return;
    setSaving(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } catch {
      // Toasted by the caller's mutation; keep the text.
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-[var(--radius-md)] px-2.5 text-sm text-[var(--ink-muted)]',
          'transition-colors hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]',
          className,
        )}
      >
        <Plus size={14} aria-hidden="true" />
        {label}
      </button>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <textarea
        ref={inputRef}
        value={title}
        rows={2}
        maxLength={200}
        aria-label="Card title"
        placeholder="Enter a title for this card…"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void submit();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
        onBlur={() => {
          if (!title.trim() && !saving) setOpen(false);
        }}
        className={cn(
          'glass-raised w-full resize-none rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--ink-primary)]',
          'placeholder:text-[var(--ink-muted)] focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none',
        )}
      />
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={trimmed.length < MIN_TITLE}
          // Keep focus in the textarea so the blur handler does not close it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void submit()}
        >
          Add card
        </Button>
        <IconButton label="Cancel" size="sm" onClick={close}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
}
