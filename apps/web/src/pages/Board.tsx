import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners,
  useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  KANBAN_COLUMNS, TASK_STATUS_LABEL, canTransition, type Task, type TaskStatus,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { useProjectRoom } from '@/lib/socket.jsx';
import { cn } from '@/lib/cn.js';
import { dueLabel, pluralise } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { pickDefaultProject, useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { useToast } from '@/components/ui/Toast.jsx';
import { CardComposer } from '@/components/QuickAdd.jsx';
import { Page } from '@/components/shell/AppShell.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge, PriorityBadge, Reference } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { FilterSelect } from '@/components/ui/Toolbar.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { Attach, Chat, Kanban as KanbanIcon, Plus } from '@/components/icons.jsx';
import { TaskComposer } from '@/components/TaskComposer.jsx';

type Board = Record<TaskStatus, Task[]>;

/**
 * Kanban board.
 *
 * Drag and drop with @dnd-kit, which gives a keyboard path as well as a pointer
 * one — a board that can only be used with a mouse excludes people. Moves are
 * applied optimistically and rolled back if the server refuses, and the server
 * re-validates every transition, so an illegal drop cannot stick.
 */
export function BoardPage() {
  const { allows, user, isAdmin } = useAuth();
  const { data: projects } = useProjectOptions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [composerOpen, setComposerOpen] = useQueryFlag('new');
  const [composerStatus, setComposerStatus] = useState<TaskStatus>('TODO');
  const [dragging, setDragging] = useState<Task | null>(null);

  const { filters, setFilter } = useFilters({
    projectId: '',
    // Explicit `all`: an empty value would fall back to a developer's `me`.
    assigneeId: isAdmin ? 'all' : 'me',
  });

  // Default to the first project, since a board without one is meaningless.
  const projectId = filters.projectId || pickDefaultProject(projects, user?.preferences.defaultProjectId);

  const query = {
    projectId: projectId || undefined,
    assigneeId: filters.assigneeId === 'all' ? undefined : filters.assigneeId || undefined,
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.board(query),
    queryFn: () => api.get<Board>('/tasks/board', query),
    enabled: Boolean(projectId),
  });

  // Live updates from other people's drags.
  useProjectRoom(projectId || undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // A small distance threshold so a click on a card is not read as a drag.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => KANBAN_COLUMNS, []);

  const findTask = useCallback(
    (id: string): { task: Task; from: TaskStatus } | null => {
      if (!data) return null;
      for (const status of columns) {
        const task = data[status]?.find((t) => t.id === id);
        if (task) return { task, from: status };
      }
      return null;
    },
    [data, columns],
  );

  const onDragStart = (event: DragStartEvent) => {
    const found = findTask(String(event.active.id));
    setDragging(found?.task ?? null);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over || !data) return;

    const found = findTask(String(active.id));
    if (!found) return;

    // The drop target is either a column or another card in one.
    const overId = String(over.id);
    const target = columns.includes(overId as TaskStatus)
      ? (overId as TaskStatus)
      : findTask(overId)?.from;
    if (!target || target === found.from) return;

    if (!canTransition(found.from, target)) {
      toast.error(
        'That move is not allowed',
        `A task cannot go straight from ${TASK_STATUS_LABEL[found.from]} to ${TASK_STATUS_LABEL[target]}.`,
      );
      return;
    }

    /*
     * Fractional ranking: the new position is the midpoint between the
     * neighbours it landed between, so a reorder rewrites one row instead of
     * renumbering the column.
     */
    const destination = data[target] ?? [];
    const position = destination.length === 0 ? 1000 : (destination[0]?.position ?? 1000) - 100;

    const previous = queryClient.getQueryData<Board>(keys.board(query));

    // Optimistic move, so the card stays under the cursor.
    queryClient.setQueryData<Board>(keys.board(query), (current) => {
      if (!current) return current;
      const next = { ...current };
      next[found.from] = (next[found.from] ?? []).filter((t) => t.id !== found.task.id);
      next[target] = [{ ...found.task, status: target, position }, ...(next[target] ?? [])];
      return next;
    });

    try {
      await api.post(`/tasks/${found.task.id}/move`, { status: target, position });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      // Restore the exact prior board rather than refetching, which would
      // briefly show the card back in its old column and then move it.
      if (previous) queryClient.setQueryData(keys.board(query), previous);
      const message = err instanceof Error ? err.message : 'The move was rejected.';
      toast.error('Could not move the task', message);
    }
  };

  // Inline "Add a card": title only, in the column it was typed into.
  const quickAdd = useMutate(
    ({ title, status }: { title: string; status: TaskStatus }) =>
      api.post<Task>('/tasks', {
        projectId,
        title,
        status,
        // On "Just me" a new card should not vanish from the board it was added to.
        ...(filters.assigneeId === 'me' && user ? { assigneeId: user.id } : {}),
      }),
    {
      invalidates: [['tasks'], ['dashboard'], ['projects']],
      errorMessage: 'Could not add the card',
    },
  );

  const openComposer = (status: TaskStatus) => {
    setComposerStatus(status);
    setComposerOpen(true);
  };

  const totalTasks = data ? columns.reduce((sum, status) => sum + (data[status]?.length ?? 0), 0) : 0;

  return (
    <Page
      fullBleed
      title="Kanban Board"
      description={
        projectId
          ? `${pluralise(totalTasks, 'task')} on the board${filters.assigneeId === 'me' ? ', assigned to you' : ''}.`
          : 'Pick a project to see its board.'
      }
      actions={
        allows('task:create') &&
        projectId && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openComposer('TODO')}>
            New task
          </Button>
        )
      }
      toolbar={
        <>
          <FilterSelect
            label="Project"
            value={filters.projectId || projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((project) => ({ value: project.id, label: project.name }))}
          />
          <SegmentedControl
            value={filters.assigneeId === 'me' ? 'me' : 'all'}
            onChange={(value) => setFilter('assigneeId', value)}
            size="sm"
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'me', label: 'Just me' },
            ]}
          />
        </>
      }
    >
      {!projectId ? (
        <div className="p-6">
          <EmptyState
            icon={<KanbanIcon size={20} />}
            title="No project selected"
            message="The board shows one project at a time."
          />
        </div>
      ) : isLoading ? (
        <div className="flex h-full gap-3 overflow-x-auto p-4 sm:p-6">
          {columns.map((status) => (
            <div key={status} className="flex w-72 shrink-0 flex-col gap-2">
              <Skeleton className="h-8" />
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-6">
          <ErrorState message="The board could not be loaded." onRetry={() => void refetch()} />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={(event) => void onDragEnd(event)}
          onDragCancel={() => setDragging(null)}
        >
          <div className="flex h-full gap-3 overflow-x-auto p-4 sm:p-6">
            {columns.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={data![status] ?? []}
                canCreate={allows('task:create')}
                onCreate={() => openComposer(status)}
                onQuickAdd={(title) => quickAdd.mutateAsync({ title, status })}
                currentUserId={user?.id}
              />
            ))}
          </div>

          {/* The dragged card follows the cursor at a slight tilt, which reads
              as "picked up" rather than "glitched". Portalled because the glass
              panel's backdrop-filter would otherwise offset a fixed overlay. */}
          {createPortal(
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
              {dragging && (
                <div className="w-72 rotate-2 cursor-grabbing opacity-95">
                  <TaskCard task={dragging} isDragging />
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}

      <TaskComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultProjectId={projectId}
        defaultStatus={composerStatus}
      />
    </Page>
  );
}

/* ---------------------------------------------------------------- column */

const COLUMN_TONE: Record<TaskStatus, string> = {
  BACKLOG: 'var(--ink-faint)',
  TODO: 'var(--ink-muted)',
  IN_PROGRESS: 'var(--status-info)',
  IN_REVIEW: 'var(--accent)',
  BLOCKED: 'var(--status-critical)',
  DONE: 'var(--status-good)',
};

/**
 * Columns a card may be typed straight into. Done and Blocked are states work
 * reaches, not where it starts; the header's "+" still opens the full form.
 */
const INLINE_ADD: ReadonlySet<TaskStatus> = new Set(['BACKLOG', 'TODO', 'IN_PROGRESS']);

function Column({
  status,
  tasks,
  canCreate,
  onCreate,
  onQuickAdd,
  currentUserId,
}: {
  status: TaskStatus;
  tasks: Task[];
  canCreate: boolean;
  onCreate: () => void;
  onQuickAdd: (title: string) => Promise<unknown>;
  currentUserId?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const points = tasks.reduce((sum, task) => sum + (task.estimate ?? 0), 0);

  return (
    <section
      ref={setNodeRef}
      aria-label={`${TASK_STATUS_LABEL[status]} column, ${tasks.length} tasks`}
      className={cn(
        'glass-tile flex max-h-full w-72 shrink-0 flex-col self-start rounded-[var(--radius-xl)]',
        'transition-[background-color,box-shadow] duration-[var(--duration-fast)]',
        isOver && 'bg-[var(--accent-wash)] ring-1 ring-inset ring-[var(--accent)]/40',
      )}
    >
      <header className="flex shrink-0 items-center gap-2 px-3.5 pt-3 pb-2">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: COLUMN_TONE[status] }} />
        <h2 className="text-sm font-semibold text-[var(--ink-primary)]">{TASK_STATUS_LABEL[status]}</h2>
        <span className="glass-control rounded-full px-1.5 text-2xs font-medium text-[var(--ink-muted)] tabular-nums">
          {tasks.length}
        </span>
        {points > 0 && (
          <span className="text-2xs text-[var(--ink-faint)] tabular-nums">{points} pts</span>
        )}
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            aria-label={`Add a task to ${TASK_STATUS_LABEL[status]} with details`}
            title="Add with details"
            className="ml-auto rounded-[var(--radius-xs)] p-0.5 text-[var(--ink-faint)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink-primary)]"
          >
            <Plus size={13} />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-1 scrollbar-none">
        {tasks.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--line)] px-3 py-6 text-center text-2xs text-[var(--ink-faint)]">
            {isOver ? 'Drop here' : 'Nothing here'}
          </p>
        ) : (
          tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} isMine={task.assignee?.id === currentUserId} />
          ))
        )}
      </div>

      {canCreate && INLINE_ADD.has(status) && (
        <div className="shrink-0 px-2 pt-1 pb-2">
          <CardComposer onAdd={onQuickAdd} label={tasks.length === 0 ? 'Add a card' : 'Add another card'} />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ card */

function SortableTaskCard({ task, isMine }: { task: Task; isMine: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // The original fades rather than vanishing, so the column does not jump.
      className={cn('touch-none', isDragging && 'opacity-30')}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} isMine={isMine} />
    </div>
  );
}

function TaskCard({
  task,
  isMine = false,
  isDragging = false,
}: {
  task: Task;
  isMine?: boolean;
  isDragging?: boolean;
}) {
  const due = dueLabel(task.dueDate);
  const blocked = task.blockedBy.some((b) => b.status !== 'DONE');

  return (
    <article
      className={cn(
        'glass-raised group rounded-[var(--radius-lg)] p-3',
        'transition-[box-shadow,transform] duration-[var(--duration-fast)]',
        !isDragging && 'cursor-grab hover:ring-[var(--line-strong)] hover:shadow-[var(--shadow-md)]',
        isDragging && 'shadow-[var(--shadow-lg)] ring-[var(--accent)]/40',
        // A left edge marks work assigned to the viewer on a shared board.
        isMine && 'border-l-2 border-l-[var(--accent)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/tasks/${task.id}`}
          // The link must not start a drag, so the pointer event stops here.
          onPointerDown={(event) => event.stopPropagation()}
          className="min-w-0 flex-1"
        >
          <span className="flex items-center gap-1.5">
            <Reference>{task.reference}</Reference>
            {task.type === 'BUG' && <Badge tone="critical" size="sm">Bug</Badge>}
            {blocked && <Badge tone="critical" size="sm" dot>Blocked</Badge>}
          </span>
          <h3 className="mt-1 line-clamp-3 text-xs leading-snug font-medium text-[var(--ink-primary)]">
            {task.title}
          </h3>
        </Link>
      </div>

      {task.labels.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <li key={label}>
              <Badge tone="neutral" size="sm">{label}</Badge>
            </li>
          ))}
        </ul>
      )}

      {task.subtaskCount > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-[var(--ink-faint)]">
            <span>Subtasks</span>
            <span className="tabular-nums">{task.doneSubtaskCount}/{task.subtaskCount}</span>
          </div>
          <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${(task.doneSubtaskCount / task.subtaskCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      <footer className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {task.estimate !== null && (
            <span className="rounded-[var(--radius-xs)] bg-[var(--surface-3)] px-1.5 text-[10px] font-medium text-[var(--ink-muted)] tabular-nums">
              {task.estimate}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 text-[var(--ink-faint)]">
          {task.commentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] tabular-nums">
              <Chat size={10} />
              {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] tabular-nums">
              <Attach size={10} />
              {task.attachmentCount}
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                'text-[10px] tabular-nums',
                due.tone === 'overdue'
                  ? 'font-medium text-[var(--status-critical-ink)]'
                  : due.tone === 'today'
                    ? 'font-medium text-[var(--status-warning-ink)]'
                    : '',
              )}
            >
              {due.tone === 'overdue' || due.tone === 'today' ? due.text : due.text.replace('Due ', '')}
            </span>
          )}
          {task.assignee && <Avatar user={task.assignee} size="xs" />}
        </div>
      </footer>
    </article>
  );
}
