import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { completeSprintSchema, createSprintSchema, type Sprint } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { daysUntil, percent, pluralise, shortDate } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { pickDefaultProject, useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, LinkButton } from '@/components/ui/Button.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Progress } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { FilterSelect } from '@/components/ui/Toolbar.jsx';
import { Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { BurndownChart, VelocityChart } from '@/components/charts/index.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { Kanban, Plus, Sprint as SprintIcon, Target } from '@/components/icons.jsx';

/**
 * Sprints.
 *
 * The active sprint gets a full panel with its burndown, because that is the
 * one people check daily; planned and completed sprints are compact rows below
 * it. Completing a sprint always asks where unfinished work goes — carrying it
 * over silently is how a backlog quietly rots.
 */
export function SprintsPage() {
  const { allows, user } = useAuth();
  const { data: projects } = useProjectOptions();
  const [createOpen, setCreateOpen] = useQueryFlag('new');
  const [completing, setCompleting] = useState<Sprint | null>(null);

  const { filters, setFilter } = useFilters({ projectId: '' });
  const projectId = filters.projectId || pickDefaultProject(projects, user?.preferences.defaultProjectId);

  const { data: sprints, isLoading, error, refetch } = useQuery({
    queryKey: keys.sprints(projectId),
    queryFn: () => api.get<Sprint[]>('/sprints', { projectId }),
    enabled: Boolean(projectId),
  });

  const { data: velocity } = useQuery({
    queryKey: keys.velocity(projectId),
    queryFn: () => api.get<Array<{ sprint: string; committed: number; completed: number }>>('/sprints/velocity', { projectId }),
    enabled: Boolean(projectId),
  });

  const start = useMutate((id: string) => api.post<Sprint>(`/sprints/${id}/start`), {
    invalidates: [['sprints'], ['dashboard'], ['tasks']],
    successMessage: 'Sprint started',
  });

  const active = sprints?.find((sprint) => sprint.status === 'ACTIVE') ?? null;
  const planned = sprints?.filter((sprint) => sprint.status === 'PLANNED') ?? [];
  const completed = sprints?.filter((sprint) => sprint.status === 'COMPLETED') ?? [];

  return (
    <Page
      title="Sprints"
      description="Plan, run and close out iterations."
      actions={
        allows('sprint:create') &&
        projectId && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            New sprint
          </Button>
        )
      }
      toolbar={
        <FilterSelect
          label="Project"
          value={filters.projectId || projectId}
          onChange={(value) => setFilter('projectId', value)}
          options={(projects ?? []).map((project) => ({ value: project.id, label: project.name }))}
        />
      }
    >
      {!projectId ? (
        <EmptyState icon={<SprintIcon size={20} />} title="No project selected" message="Sprints belong to a project." />
      ) : isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-32" />
        </div>
      ) : error ? (
        <ErrorState message="Sprints could not be loaded." onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* ----------------------------------------------- active sprint */}
          {active ? (
            <ActiveSprintPanel
              sprint={active}
              canComplete={allows('sprint:complete')}
              onComplete={() => setCompleting(active)}
            />
          ) : (
            <Card>
              <EmptyState
                icon={<SprintIcon size={18} />}
                title="No sprint running"
                message={
                  planned.length > 0
                    ? 'Start a planned sprint below to begin the iteration.'
                    : allows('sprint:create')
                      ? 'Create a sprint to start planning an iteration.'
                      : 'Your team lead has not started a sprint yet.'
                }
                compact
                action={
                  planned.length === 0 && allows('sprint:create') ? (
                    <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                      New sprint
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}

          {/* -------------------------------------------------- velocity */}
          {velocity && velocity.length > 0 && (
            <Card>
              <VelocityChart
                data={velocity}
                title="Velocity"
                height={200}
              />
              <p className="mt-2 text-2xs text-[var(--ink-muted)]">
                Average completed:{' '}
                <strong className="text-[var(--ink-primary)] tabular-nums">
                  {Math.round(velocity.reduce((sum, v) => sum + v.completed, 0) / velocity.length)} points
                </strong>{' '}
                per sprint — a reasonable starting commitment for the next one.
              </p>
            </Card>
          )}

          {/* ------------------------------------------------ planned list */}
          {planned.length > 0 && (
            <Card>
              <CardHeader title="Planned" subtitle={pluralise(planned.length, 'sprint')} />
              <ul className="mt-3 flex flex-col gap-2">
                {planned.map((sprint) => (
                  <li key={sprint.id}>
                    <SprintRow
                      sprint={sprint}
                      action={
                        allows('sprint:start') &&
                        !active && (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={start.isPending}
                            onClick={() => start.mutate(sprint.id)}
                          >
                            Start
                          </Button>
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---------------------------------------------- completed list */}
          {completed.length > 0 && (
            <Card>
              <CardHeader title="Completed" subtitle={pluralise(completed.length, 'sprint')} />
              <ul className="mt-3 flex flex-col gap-2">
                {completed.map((sprint) => (
                  <li key={sprint.id}>
                    <SprintRow sprint={sprint} />
                    {sprint.retrospective && (
                      <details className="mt-1 ml-3 group">
                        <summary className="cursor-pointer list-none text-2xs text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]">
                          <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                          Retrospective
                        </summary>
                        <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2">
                          <Markdown content={sprint.retrospective} />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <CreateSprintModal open={createOpen} onClose={() => setCreateOpen(false)} projectId={projectId} />
      {completing && (
        <CompleteSprintModal
          sprint={completing}
          plannedSprints={planned}
          onClose={() => setCompleting(null)}
        />
      )}
    </Page>
  );
}

function ActiveSprintPanel({
  sprint, canComplete, onComplete,
}: {
  sprint: Sprint;
  canComplete: boolean;
  onComplete: () => void;
}) {
  const daysLeft = daysUntil(sprint.endDate) ?? 0;
  const progress = sprint.committedPoints > 0 ? (sprint.completedPoints / sprint.committedPoints) * 100 : 0;
  const overCapacity = sprint.capacityPoints !== null && sprint.committedPoints > sprint.capacityPoints;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone="good" dot size="md">Active</Badge>
            <h2 className="text-lg font-semibold tracking-tight">{sprint.name}</h2>
          </div>
          {sprint.goal && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
              <Target size={13} className="mt-0.5 shrink-0 text-[var(--ink-faint)]" />
              {sprint.goal}
            </p>
          )}
          <p className="mt-1.5 text-2xs text-[var(--ink-muted)]">
            {shortDate(sprint.startDate)} → {shortDate(sprint.endDate)} ·{' '}
            <span
              className={cn(
                'font-medium',
                daysLeft < 0
                  ? 'text-[var(--status-critical-ink)]'
                  : daysLeft <= 2
                    ? 'text-[var(--status-warning-ink)]'
                    : 'text-[var(--ink-secondary)]',
              )}
            >
              {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : daysLeft === 0 ? 'Ends today' : `${daysLeft} days left`}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <LinkButton to={`/board?sprintId=${sprint.id}`} variant="secondary" size="sm" icon={<Kanban size={14} />}>
            Board
          </LinkButton>
          {canComplete && (
            <Button variant="primary" size="sm" onClick={onComplete}>
              Complete sprint
            </Button>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Committed', value: `${sprint.committedPoints} pts`, hint: sprint.capacityPoints !== null ? `of ${sprint.capacityPoints} capacity` : undefined, warn: overCapacity },
          { label: 'Completed', value: `${sprint.completedPoints} pts`, hint: percent(progress) },
          { label: 'Tasks done', value: `${sprint.doneTaskCount}/${sprint.taskCount}` },
          { label: 'Remaining', value: `${Math.max(0, sprint.committedPoints - sprint.completedPoints)} pts` },
        ].map((item) => (
          <div
            key={item.label}
            className={cn(
              'rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2.5',
              item.warn && 'ring-1 ring-inset ring-[var(--status-warning)]/40',
            )}
          >
            <dt className="text-2xs text-[var(--ink-faint)]">{item.label}</dt>
            <dd className="mt-0.5 text-md font-semibold tabular-nums">{item.value}</dd>
            {item.hint && <dd className="text-2xs text-[var(--ink-muted)]">{item.hint}</dd>}
          </div>
        ))}
      </dl>

      {overCapacity && (
        <p
          role="status"
          className="mt-3 flex items-start gap-1.5 rounded-[var(--radius-md)] bg-[var(--status-warning-wash)] px-3 py-2 text-2xs text-[var(--status-warning-ink)]"
        >
          <span aria-hidden="true">⚠</span>
          This sprint is committed above its capacity. Consider moving work to the next one.
        </p>
      )}

      <div className="mt-4">
        <Progress value={progress} showLabel tone={daysLeft < 0 && progress < 100 ? 'warning' : 'accent'} />
      </div>

      {sprint.burndown.length > 0 && (
        <div className="mt-5 border-t border-[var(--line-subtle)] pt-4">
          <BurndownChart data={sprint.burndown} title="Burndown" height={200} />
        </div>
      )}
    </Card>
  );
}

function SprintRow({ sprint, action }: { sprint: Sprint; action?: React.ReactNode }) {
  const progress = sprint.committedPoints > 0 ? (sprint.completedPoints / sprint.committedPoints) * 100 : 0;
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate-line text-xs font-medium">{sprint.name}</span>
        <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
          {shortDate(sprint.startDate)} → {shortDate(sprint.endDate)} · {sprint.taskCount} tasks
        </span>
      </span>
      <span className="hidden w-28 shrink-0 md:block">
        <Progress value={progress} size="xs" showLabel tone={sprint.status === 'COMPLETED' ? 'good' : 'accent'} />
      </span>
      <span className="shrink-0 text-2xs text-[var(--ink-muted)] tabular-nums">
        {sprint.completedPoints}/{sprint.committedPoints} pts
      </span>
      {action}
    </div>
  );
}

function CreateSprintModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  // Defaults to a standard two-week iteration starting today.
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const [capacity, setCapacity] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutate((input: unknown) => api.post<Sprint>('/sprints', input), {
    invalidates: [['sprints'], ['dashboard']],
    successMessage: 'Sprint created',
    onSuccess: () => {
      setName(''); setGoal(''); setCapacity(''); setErrors({});
      onClose();
    },
  });

  const submit = () => {
    const parsed = createSprintSchema.safeParse({
      projectId, name, goal: goal || undefined, startDate, endDate,
      capacityPoints: capacity === '' ? undefined : Number(capacity),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New sprint"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>Create sprint</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput
          label="Name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          placeholder="Sprint 24.5"
        />
        <TextArea
          label="Goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          error={errors.goal}
          rows={2}
          placeholder="What should be true at the end of this sprint?"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Starts" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} error={errors.startDate} />
          <TextInput label="Ends" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} error={errors.endDate} />
          <TextInput
            label="Capacity"
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            error={errors.capacityPoints}
            hint="Story points"
          />
        </div>
      </div>
    </Modal>
  );
}

function CompleteSprintModal({
  sprint, plannedSprints, onClose,
}: {
  sprint: Sprint;
  plannedSprints: Sprint[];
  onClose: () => void;
}) {
  const [moveTo, setMoveTo] = useState('BACKLOG');
  const [retrospective, setRetrospective] = useState('');

  const complete = useMutate(
    (input: unknown) => api.post<Sprint>(`/sprints/${sprint.id}/complete`, input),
    {
      invalidates: [['sprints'], ['tasks'], ['dashboard']],
      successMessage: 'Sprint completed',
      onSuccess: onClose,
    },
  );

  const unfinished = sprint.taskCount - sprint.doneTaskCount;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Complete ${sprint.name}`}
      description={`${sprint.completedPoints} of ${sprint.committedPoints} points delivered.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={complete.isPending}
            onClick={() =>
              complete.mutate(
                completeSprintSchema.parse({
                  moveUnfinishedTo: moveTo,
                  retrospective: retrospective || undefined,
                }),
              )
            }
          >
            Complete sprint
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {unfinished > 0 ? (
          <Select
            label={`Move ${pluralise(unfinished, 'unfinished task')} to`}
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            hint="Unfinished work has to go somewhere explicit."
          >
            <option value="BACKLOG">Back to the backlog</option>
            {plannedSprints.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </Select>
        ) : (
          <p className="rounded-[var(--radius-md)] bg-[var(--status-good-wash)] px-3 py-2 text-xs text-[var(--status-good-ink)]">
            Every task in this sprint is done. Nothing to carry over.
          </p>
        )}

        <TextArea
          label="Retrospective"
          value={retrospective}
          onChange={(e) => setRetrospective(e.target.value)}
          rows={6}
          placeholder={'What went well?\n\nWhat should change?\n\nWhat will we try next?'}
          hint="Markdown is supported. This stays with the sprint."
          className="font-mono text-xs"
        />
      </div>
    </Modal>
  );
}
