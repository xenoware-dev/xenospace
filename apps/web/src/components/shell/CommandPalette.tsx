import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Paginated, Project, Task } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { cn } from '@/lib/cn.js';
import { keys } from '@/lib/queryClient.js';
import { Search } from '../icons.jsx';
import { Kbd } from '../ui/Menu.jsx';
import { navLabel, visibleSections } from './navigation.js';

/**
 * Command palette.
 *
 * The keyboard path through the whole app: ⌘K, type, Enter. Navigation targets
 * come from the same permission-filtered model as the sidebar, and search
 * results are debounced so typing does not fire a request per keystroke.
 */

interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { allows, isAdmin } = useAuth();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Reset on each open, so the palette never reopens mid-search.
  useEffect(() => {
    if (open) {
      setQuery('');
      setDebounced('');
      setSelected(0);
      // Focused after paint, or the dialog animation steals it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searchable = debounced.length >= 2;

  const { data: tasks } = useQuery({
    queryKey: keys.tasks({ q: debounced, palette: true }),
    queryFn: () => api.get<Paginated<Task>>('/tasks', { q: debounced, pageSize: 5 }),
    enabled: open && searchable && allows('task:read'),
    staleTime: 15_000,
  });

  const { data: projects } = useQuery({
    queryKey: keys.projects({ q: debounced, palette: true }),
    queryFn: () => api.get<Paginated<Project>>('/projects', { q: debounced, pageSize: 4 }),
    enabled: open && searchable && allows('project:read'),
    staleTime: 15_000,
  });

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };

    const navCommands: Command[] = visibleSections(allows, isAdmin).flatMap((section) =>
      section.items.map((item) => ({
        id: `nav:${item.to}`,
        label: navLabel(item, isAdmin),
        group: 'Go to',
        run: go(item.to),
      })),
    );

    const actions: Command[] = [];
    if (allows('task:create')) {
      actions.push({ id: 'new:task', label: 'New task', group: 'Create', hint: 'Opens the task composer', run: go('/tasks?new=1') });
    }
    if (allows('project:create')) {
      actions.push({ id: 'new:project', label: 'New project', group: 'Create', run: go('/projects?new=1') });
    }
    if (allows('issue:create')) {
      actions.push({ id: 'new:issue', label: 'Report an issue', group: 'Create', run: go('/issues?new=1') });
    }
    if (allows('kb:create')) {
      actions.push({ id: 'new:note', label: 'New knowledge-base note', group: 'Create', run: go('/knowledge?new=1') });
    }

    const results: Command[] = [
      ...(tasks?.items ?? []).map((task) => ({
        id: `task:${task.id}`,
        label: task.title,
        group: 'Tasks',
        hint: task.reference,
        run: go(`/tasks/${task.id}`),
      })),
      ...(projects?.items ?? []).map((project) => ({
        id: `project:${project.id}`,
        label: project.name,
        group: 'Projects',
        hint: project.key,
        run: go(`/projects/${project.id}`),
      })),
    ];

    const term = debounced.toLowerCase();
    const matches = (command: Command) =>
      !term || command.label.toLowerCase().includes(term) || command.group.toLowerCase().includes(term);

    // Live results lead when searching; otherwise the palette is a launcher.
    return term
      ? [...results, ...actions.filter(matches), ...navCommands.filter(matches)]
      : [...actions, ...navCommands];
  }, [allows, isAdmin, navigate, onClose, tasks, projects, debounced]);

  // Clamp the cursor when the result set shrinks under it.
  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, commands.length - 1)));
  }, [commands.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setSelected((current) => {
          const next = (current + delta + commands.length) % commands.length;
          listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commands[selected]?.run();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, commands, selected, onClose]);

  if (!open) return null;

  // Grouped for rendering, while `selected` indexes the flat list.
  const groups: Array<{ name: string; items: Array<{ command: Command; index: number }> }> = [];
  commands.forEach((command, index) => {
    const group = groups.find((g) => g.name === command.group);
    if (group) group.items.push({ command, index });
    else groups.push({ name: command.group, items: [{ command, index }] });
  });

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-[var(--surface-overlay)] backdrop-blur-[2px] xs-animate-fade"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={cn(
          'glass-overlay relative w-full max-w-xl overflow-hidden rounded-[var(--radius-2xl)]',
          'animate-[xs-rise_var(--duration)_var(--ease-out)]',
        )}
      >
        <div className="flex items-center gap-3 border-b border-[var(--line-subtle)] px-4">
          <Search size={16} className="shrink-0 text-[var(--ink-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks and projects, or jump to a page…"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ink-faint)]"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div className="max-h-[min(24rem,50dvh)] overflow-y-auto p-2">
          {commands.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-[var(--ink-muted)]">
              Nothing matches “{debounced}”.
            </p>
          ) : (
            <ul ref={listRef} role="listbox" aria-label="Commands">
              {groups.map((group) => (
                <li key={group.name} role="presentation">
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-[var(--ink-faint)] uppercase">
                    {group.name}
                  </p>
                  <ul role="presentation">
                    {group.items.map(({ command, index }) => (
                      <li key={command.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === selected}
                          onClick={command.run}
                          onMouseEnter={() => setSelected(index)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left',
                            'transition-colors duration-[var(--duration-fast)]',
                            index === selected
                              ? 'bg-[var(--wash-selected)] text-[var(--ink-primary)]'
                              : 'text-[var(--ink-secondary)]',
                          )}
                        >
                          <span className="flex-1 truncate-line text-xs">{command.label}</span>
                          {command.hint && (
                            <span className="shrink-0 font-mono text-2xs text-[var(--ink-faint)]">
                              {command.hint}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-[var(--line-subtle)] bg-[var(--surface-2)] px-4 py-2 text-2xs text-[var(--ink-faint)]">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
        </div>
      </div>
    </div>
  );
}
