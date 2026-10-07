import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PublicUser } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { Avatar } from './ui/Avatar.jsx';
import { SearchField } from './ui/Toolbar.jsx';
import { Check, X } from './icons.jsx';

/**
 * Multi-select person picker.
 *
 * Candidates come from `/members/mentionable`, which is scoped server-side to
 * people the viewer actually shares a project with — so the picker cannot be
 * used to enumerate the whole organisation.
 */
export function MemberPicker({
  label,
  hint,
  selected,
  onChange,
  /** Restricts candidates to members of one project. */
  projectId,
  max = 50,
  className,
}: {
  label?: string;
  hint?: string;
  selected: string[];
  onChange: (next: string[]) => void;
  projectId?: string;
  max?: number;
  className?: string;
}) {
  const [search, setSearch] = useState('');

  const { data: candidates, isLoading } = useQuery({
    queryKey: projectId ? keys.projectMembers(projectId) : keys.mentionable(search),
    queryFn: () =>
      projectId
        ? api
            .get<Array<{ user: PublicUser }>>(`/projects/${projectId}/members`)
            .then((rows) => rows.map((row) => row.user))
        : api.get<PublicUser[]>('/members/mentionable', { q: search || undefined }),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const list = candidates ?? [];
    if (!projectId || !search) return list;
    const term = search.toLowerCase();
    return list.filter((user) => user.name.toLowerCase().includes(term) || user.email.toLowerCase().includes(term));
  }, [candidates, projectId, search]);

  const selectedUsers = useMemo(
    () => (candidates ?? []).filter((user) => selected.includes(user.id)),
    [candidates, selected],
  );

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((value) => value !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-[var(--ink-secondary)]">{label}</span>
          {selected.length > 0 && (
            <span className="text-2xs text-[var(--ink-faint)] tabular-nums">{selected.length} selected</span>
          )}
        </div>
      )}

      {/* Selected people are chips above the list, so a long list does not hide
          what has already been chosen. */}
      {selectedUsers.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selectedUsers.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => toggle(user.id)}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--accent-wash)] py-0.5 pr-1.5 pl-0.5 text-2xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-wash-strong)]"
              >
                <Avatar user={user} size="xs" />
                {user.name}
                <X size={10} aria-label={`Remove ${user.name}`} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <SearchField value={search} onChange={setSearch} placeholder="Search people…" />

      <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] ring-1 ring-inset ring-[var(--line-subtle)]">
        {isLoading ? (
          <p className="px-3 py-6 text-center text-2xs text-[var(--ink-muted)]">Loading people…</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-2xs text-[var(--ink-muted)]">
            {search ? `Nobody matches “${search}”.` : 'No people available.'}
          </p>
        ) : (
          <ul>
            {filtered.map((user) => {
              const isSelected = selected.includes(user.id);
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => toggle(user.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors',
                      isSelected ? 'bg-[var(--wash-selected)]' : 'hover:bg-[var(--wash-hover)]',
                    )}
                  >
                    <Avatar user={user} size="sm" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate-line text-xs font-medium">{user.name}</span>
                      <span className="block truncate-line text-2xs text-[var(--ink-faint)]">
                        {user.jobTitle ?? user.email}
                      </span>
                    </span>
                    {isSelected && <Check size={13} className="shrink-0 text-[var(--accent)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hint && <p className="text-2xs text-[var(--ink-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * Single-person select, for an assignee.
 *
 * Includes an explicit "Unassigned" option — leaving work unassigned is a
 * legitimate state, not an absence of input.
 */
export function AssigneeSelect({
  value,
  onChange,
  projectId,
  label = 'Assignee',
  disabled,
  className,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  projectId?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { data: candidates } = useQuery({
    queryKey: projectId ? keys.projectMembers(projectId) : keys.mentionable(),
    queryFn: () =>
      projectId
        ? api
            .get<Array<{ user: PublicUser }>>(`/projects/${projectId}/members`)
            .then((rows) => rows.map((row) => row.user))
        : api.get<PublicUser[]>('/members/mentionable'),
    staleTime: 60_000,
    enabled: !disabled,
  });

  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-[var(--ink-secondary)]">{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(
          'h-9 cursor-pointer appearance-none rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 text-sm',
          'ring-1 ring-inset ring-[var(--line)] transition-[box-shadow]',
          'hover:ring-[var(--line-strong)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <option value="">Unassigned</option>
        {(candidates ?? []).map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
    </label>
  );
}
