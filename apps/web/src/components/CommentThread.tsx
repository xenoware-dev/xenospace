import { useState } from 'react';
import type { Comment } from '@xenospace/shared';
import { cn } from '@/lib/cn.js';
import { relativeTime } from '@/lib/format.js';
import { Avatar } from './ui/Avatar.jsx';
import { Button } from './ui/Button.jsx';
import { EmptyState } from './ui/Empty.jsx';
import { Markdown } from './Markdown.jsx';
import { Chat, Send } from './icons.jsx';

/**
 * Comment list and composer.
 *
 * The composer submits on ⌘/Ctrl+Enter as well as the button, because a
 * multi-line field cannot submit on plain Enter without eating line breaks.
 */
export function CommentThread({
  comments,
  onSubmit,
  submitting,
  placeholder = 'Add a comment…',
  emptyMessage = 'No comments yet. Start the discussion.',
}: {
  comments: Comment[];
  onSubmit: (body: string) => Promise<void>;
  submitting: boolean;
  placeholder?: string;
  emptyMessage?: string;
}) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const send = async () => {
    const body = draft.trim();
    if (!body || submitting) return;
    await onSubmit(body);
    setDraft('');
    setFocused(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <EmptyState compact icon={<Chat size={16} />} title="Nothing here yet" message={emptyMessage} />
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-2.5">
              <Avatar user={comment.author} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-semibold text-[var(--ink-primary)]">
                    {comment.author.name}
                  </span>
                  <span className="text-2xs text-[var(--ink-faint)]">
                    {relativeTime(comment.createdAt)}
                    {comment.updatedAt && ' · edited'}
                  </span>
                </div>
                <div className="mt-1 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2">
                  <Markdown content={comment.body} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div
        className={cn(
          'rounded-[var(--radius-md)] bg-[var(--surface-inset)] ring-1 ring-inset transition-[box-shadow]',
          focused ? 'ring-2 ring-[var(--accent)]' : 'ring-[var(--line)]',
        )}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => !draft && setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={focused || draft ? 4 : 2}
          maxLength={10_000}
          className="w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-[var(--ink-faint)]"
        />
        <div className="flex items-center justify-between gap-2 border-t border-[var(--line-subtle)] px-2.5 py-1.5">
          <span className="text-2xs text-[var(--ink-faint)]">
            Markdown supported · ⌘↵ to send
          </span>
          <Button
            size="sm"
            variant="primary"
            icon={<Send size={12} />}
            loading={submitting}
            disabled={!draft.trim()}
            onClick={() => void send()}
          >
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
