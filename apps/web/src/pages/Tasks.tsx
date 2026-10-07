import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, TASK_TYPES,
  type Paginated, type Task,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { dueLabel, relativeTime, titleCase } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { pickDefaultProject, useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button, LinkButton } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge, PriorityBadge, Reference, TaskStatusBadge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { QuickAddTask } from '@/components/QuickAdd.jsx';
import { ClearFilters, FilterSelect, Pagination, SearchField, ToolbarSpacer } from '@/components/ui/Toolbar.jsx';
import { Kanban, Plus, Tasks as TasksIcon } from '@/components/icons.jsx';
import { TaskComposer } from '@/components/TaskComposer.jsx';

/**
 * Task list.
 *
 * A developer lands on their own assigned work; a team lead sees everything and
 * filters down. That default is the whole difference between the two roles here
 * — the same list, opened at the question each one is actually asking.
 */
export function TasksPage() {
  const { allows, isAdmin, user } = useAuth();
  const { data: projects } = useProjectOptions();
  const [composerOpen, setComposerOpen] = useQueryFlag('new');
  const [draftTitle, setDraftTitle] = useState('');

  const { filters, setFilter, clear, activeCount } = useFilters({
    q: '',
    projectId: '',
    // A developer's list opens on their own work.
    // `all` is explicit rather than empty: an empty value falls back to the
    // default, which for a developer is `me`, so "All tasks" could never stick.
    assigneeId: isAdmin ? 'all' : 'me',
    status: '',
    priority: '',
    type: '',
    overdue: '',
    sort: 'updatedAt',
    order: 'desc',
    page: '1',
  });

  const query = {
    q: filters.q || undefined,
    projectId: filters.projectId || undefined,
    assigneeId: filters.assigneeId === 'all' ? undefined : filters.assigneeId || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    type: filters.type || undefined,
    overdue: filters.overdue || undefined,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    pageSize: '25',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.tasks(query),
    queryFn: () => api.get<Paginated<Task>>('/tasks', query),
  });

  // Quick-add lands in the filtered project, else the user's default one.
  const targetProjectId = filters.projectId || pickDefaultProject(projects, user?.preferences.defaultProjectId);
  const targetProject = projects?.find((project) => project.id === targetProjectId);
  const quickCreate = useMutate((title: string) =>
    api.post<Task>('/tasks', {
      projectId: targetProjectId,
      title,
      // In "My tasks" a new task should not vanish from the list it was typed into.
      ...(filters.assigneeId === 'me' && user ? { assigneeId: user.id } : {}),
    }), {
    invalidates: [['tasks'], ['dashboard'], ['projects']],
    successMessage: (task) => `${task.reference} added`,
    errorMessage: 'Could not add the task',
  });

  const openDetails = (title = '') => {
    setDraftTitle(title);
    setComposerOpen(true);
  };

  return (
    <Page
      title={isAdmin ? 'Tasks' : 'My Tasks'}
      description={
        isAdmin
          ? 'Every task across the projects you can see.'
          : 'Work assigned to you, newest activity first.'
      }
      actions={
        <>
          <LinkButton to="/board" variant="secondary" size="sm" icon={<Kanban size={14} />}>
            Board
          </LinkButton>
          {allows('task:create') && (
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => openDetails()}>
              New task
            </Button>
          )}
        </>
      }
      toolbar={
        <>
          <SegmentedControl
            size="sm"
            value={filters.assigneeId === 'me' ? 'me' : filters.assigneeId === 'unassigned' ? 'unassigned' : 'all'}
            onChange={(value) => setFilter('assigneeId', value)}
            options={[
              { value: 'all', label: 'All tasks' },
              { value: 'me', label: 'My tasks' },
              ...(isAdmin ? [{ value: 'unassigned' as const, label: 'Unassigned' }] : []),
            ]}
          />
          <SearchField
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
            placeholder="Search title or reference…"
            className="w-full sm:w-60"
          />
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((project) => ({ value: project.id, label: project.name }))}
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilter('status', value)}
            options={TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_LABEL[status] }))}
          />
          <FilterSelect
            label="Priority"
            value={filters.priority}
            onChange={(value) => setFilter('priority', value)}
            options={PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] }))}
          />
          <FilterSelect
            label="Type"
            value={filters.type}
            onChange={(value) => setFilter('type', value)}
            options={TASK_TYPES.map((type) => ({ value: type, label: titleCase(type) }))}
          />
          <button
            type="button"
            onClick={() => setFilter('overdue', filters.overdue ? '' : 'true')}
            className={cn(
              'h-8 rounded-full px-3 text-xs font-medium transition-colors',
              filters.overdue
                ? 'bg-[var(--status-critical-wash)] text-[var(--status-critical-ink)] ring-1 ring-inset ring-[var(--status-critical)]/30'
                : 'glass-control text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]',
            )}
          >
            Overdue only
          </button>
          <ClearFilters count={activeCount} onClear={clear} />
          <ToolbarSpacer />
          <FilterSelect
            label="Sort"
            value={filters.sort === 'updatedAt' ? '' : filters.sort}
            onChange={(value) => setFilter('sort', value || 'updatedAt')}
            options={[
              { value: 'priority', label: 'Priority' },
              { value: 'dueDate', label: 'Due date' },
              { value: 'createdAt', label: 'Created' },
            ]}
          />
        </>
      }
    >
      {allows('task:create') && (projects?.length ?? 0) > 0 && (
        <div className="mb-4">
          <QuickAddTask
            onAdd={(title) => quickCreate.mutateAsync(title)}
            onOpenDetails={openDetails}
            disabled={!targetProjectId}
          />
          {targetProject && (
            <p className="mt-1.5 pl-4 text-2xs text-[var(--ink-muted)]">
              Adds to{' '}
              <span className="inline-flex items-center gap-1 text-[var(--ink-secondary)]">
                <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: targetProject.color }} />
                {targetProject.name}
              </span>
              {filters.assigneeId === 'me' ? ', assigned to you' : ''}
              {!filters.projectId && (projects?.length ?? 0) > 1 ? ' · filter by project to add elsewhere' : ''}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <Card padded={false}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="m-3 h-10" />
          ))}
        </Card>
      ) : error ? (
        <ErrorState message="Tasks could not be loaded." onRetry={() => void refetch()} />
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={<TasksIcon size={20} />}
          title={activeCount > 0 ? 'No tasks match those filters' : 'No tasks here yet'}
          message={
            activeCount > 0
              ? 'Try clearing a filter or two.'
              : isAdmin
                ? 'Create the first task to start tracking work.'
                : 'Nothing is assigned to you right now.'
          }
          action={
            activeCount > 0 ? (
              <Button variant="secondary" onClick={clear}>Clear filters</Button>
            ) : allows('task:create') ? (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => openDetails()}>
                New task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card padded={false} className="overflow-hidden">
            <ul className="divide-y divide-[var(--line-subtle)]">
              {data!.items.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          </Card>
          <Pagination
            page={data!.page}
            totalPages={data!.totalPages}
            total={data!.total}
            pageSize={data!.pageSize}
            onPageChange={(next) => setFilter('page', String(next))}
          />
        </>
      )}

      <TaskComposer
        open={composerOpen}
        onClose={() => { setComposerOpen(false); setDraftTitle(''); }}
        defaultProjectId={filters.projectId || targetProjectId || undefined}
        defaultTitle={draftTitle}
      />
    </Page>
  );
}

/** One row. Dense but readable: reference, title, then state on the right. */
export function TaskRow({ task }: { task: Task }) {
  const due = dueLabel(task.dueDate);
  const overdue = due.tone === 'overdue';

  return (
    <li>
      <Link
        to={`/tasks/${task.id}`}
        className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--wash-hover)] sm:px-4"
      >
        {/* Type glyph: a bug and a feature should not look identical. */}
        <span
          aria-hidden="true"
          title={titleCase(task.type)}
          className="grid size-5 shrink-0 place-items-center rounded-[var(--radius-xs)] text-[10px] font-bold"
          style={{
            background:
              task.type === 'BUG' ? 'var(--status-critical-wash)' : 'var(--surface-3)',
            color: task.type === 'BUG' ? 'var(--status-critical-ink)' : 'var(--ink-muted)',
          }}
        >
          {task.type[0]}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Reference>{task.reference}</Reference>
            {task.project && (
              <span className="hidden items-center gap-1 sm:flex">
                <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: task.project.color }} />
                <span className="text-2xs text-[var(--ink-faint)]">{task.project.key}</span>
              </span>
            )}
            {task.subtaskCount > 0 && (
              <span className="text-2xs text-[var(--ink-faint)] tabular-nums">
                {task.doneSubtaskCount}/{task.subtaskCount} subtasks
              </span>
            )}
            {task.blockedBy.length > 0 && (
              <Badge tone="critical" size="sm">Blocked</Badge>
            )}
          </span>
          <span className="mt-0.5 block truncate-line text-xs font-medium text-[var(--ink-primary)]">
            {task.title}
          </span>
        </span>

        <span className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {task.labels.slice(0, 2).map((label) => (
            <Badge key={label} tone="neutral" size="sm">{label}</Badge>
          ))}
        </span>

        {task.dueDate && (
          <span
            className={cn(
              'hidden w-24 shrink-0 text-right text-2xs tabular-nums md:block',
              overdue ? 'font-medium text-[var(--status-critical-ink)]' : 'text-[var(--ink-muted)]',
            )}
          >
            {due.text}
          </span>
        )}

        <span className="hidden shrink-0 sm:block">
          <PriorityBadge priority={task.priority} />
        </span>
        <span className="shrink-0">
          <TaskStatusBadge status={task.status} />
        </span>

        <span className="hidden w-24 shrink-0 text-right text-2xs whitespace-nowrap text-[var(--ink-faint)] xl:block">
          {relativeTime(task.updatedAt)}
        </span>

        <span className="shrink-0">
          {task.assignee ? (
            <Avatar user={task.assignee} size="sm" showPresence />
          ) : (
            <span
              aria-label="Unassigned"
              title="Unassigned"
              className="grid size-6 place-items-center rounded-full ring-1 ring-dashed ring-[var(--line-strong)] text-[var(--ink-faint)]"
            >
              <Plus size={10} />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
