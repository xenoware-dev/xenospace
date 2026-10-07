import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PRIORITIES, PRIORITY_LABEL, STORY_POINTS, TASK_STATUSES, TASK_STATUS_LABEL,
  canTransition, type Comment, type Task,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { dateTime, duration, dueLabel, relativeTime, titleCase } from '@/lib/format.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge, PriorityBadge, Reference, TaskStatusBadge } from '@/components/ui/Badge.jsx';
import { ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { AssigneeSelect } from '@/components/MemberPicker.jsx';
import { CommentThread } from '@/components/CommentThread.jsx';
import { TaskGitActivity } from '@/components/TaskGitActivity.jsx';
import { ChevronLeft, Clock, Edit, Trash } from '@/components/icons.jsx';

/**
 * Task detail.
 *
 * Two columns: the discussion on the left, the properties on the right. The
 * status control only offers legal transitions, taken from the same transition
 * map the server enforces — so the UI cannot suggest a move that would be
 * rejected.
 */
export function TaskDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { allows, user } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  const { data: task, isLoading, error, refetch } = useQuery({
    queryKey: keys.task(id),
    queryFn: () => api.get<Task>(`/tasks/${id}`),
    enabled: Boolean(id),
  });

  const { data: comments } = useQuery({
    queryKey: keys.taskComments(id),
    queryFn: () => api.get<Comment[]>(`/tasks/${id}/comments`),
    enabled: Boolean(id),
  });

  const move = useMutate(
    (status: Task['status']) => api.post<Task>(`/tasks/${id}/move`, { status, position: 1000 }),
    { invalidates: [['tasks'], ['dashboard']], successMessage: 'Status updated' },
  );

  const update = useMutate((input: unknown) => api.patch<Task>(`/tasks/${id}`, input), {
    invalidates: [['tasks'], ['dashboard']],
    successMessage: 'Task updated',
  });

  const remove = useMutate(() => api.delete(`/tasks/${id}`), {
    successMessage: 'Task deleted',
    onSuccess: () => {
      // Leave first, then drop the task's own queries: invalidating ['tasks']
      // while this page is mounted would refetch the deleted task and 404.
      navigate('/tasks', { replace: true });
      queryClient.removeQueries({ queryKey: keys.task(id) });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const addComment = useMutate(
    (body: string) => api.post<Comment>(`/tasks/${id}/comments`, { body, mentions: [] }),
    { invalidates: [keys.taskComments(id), keys.task(id)] },
  );

  if (isLoading) return <LoadingState className="min-h-[60vh]" label="Loading task" />;
  if (error || !task) {
    return (
      <Page title="Task">
        <ErrorState
          title="Task not found"
          message="It may have been deleted, or you may not have access to its project."
          onRetry={() => void refetch()}
        />
      </Page>
    );
  }

  // Only the moves the server would accept are offered.
  const nextStatuses = TASK_STATUSES.filter((status) => status !== task.status && canTransition(task.status, status));
  const canEdit = allows('task:update') || task.assignee?.id === user?.id || task.reporter.id === user?.id;
  const due = dueLabel(task.dueDate);

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <Link
            to="/tasks"
            aria-label="Back to tasks"
            className="rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink-primary)]"
          >
            <ChevronLeft size={16} />
          </Link>
          <span className="min-w-0">{task.title}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Reference>{task.reference}</Reference>
          {task.project && (
            <Link to={`/projects/${task.projectId}`} className="flex items-center gap-1 hover:underline">
              <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: task.project.color }} />
              {task.project.name}
            </Link>
          )}
          <span>· opened {relativeTime(task.createdAt)} by {task.reporter.name}</span>
        </span>
      }
      actions={
        <>
          {allows('task:estimate') && (
            <Button variant="secondary" size="sm" icon={<Clock size={14} />} onClick={() => setLogOpen(true)}>
              Log time
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" size="sm" icon={<Edit size={14} />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          )}
          {allows('task:delete') && (
            <IconButton label="Delete task" size="sm" variant="ghost" onClick={() => setDeleteOpen(true)}>
              <Trash size={15} />
            </IconButton>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        {/* ---------------------------------------------------------- main */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Description" />
            <div className="mt-3">
              {task.description ? (
                <Markdown content={task.description} />
              ) : (
                <p className="text-xs text-[var(--ink-faint)] italic">No description was given.</p>
              )}
            </div>
          </Card>

          {task.blockedBy.length > 0 && (
            <Card className="ring-[var(--status-critical)]/25">
              <CardHeader
                title="Blocked by"
                subtitle="These must reach Done before this task can leave Blocked."
              />
              <ul className="mt-3 flex flex-col gap-1.5">
                {task.blockedBy.map((blocker) => (
                  <li key={blocker.id}>
                    <Link
                      to={`/tasks/${blocker.id}`}
                      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-2.5 py-2 transition-colors hover:bg-[var(--surface-3)]"
                    >
                      <Reference>{blocker.reference}</Reference>
                      <span className="min-w-0 flex-1 truncate-line text-xs">{blocker.title}</span>
                      <TaskStatusBadge status={blocker.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <TaskGitActivity taskId={task.id} reference={task.reference} />

          <Card>
            <CardHeader title={`Discussion${comments?.length ? ` (${comments.length})` : ''}`} />
            <div className="mt-3">
              <CommentThread
                comments={comments ?? []}
                onSubmit={(body) => addComment.mutateAsync(body).then(() => undefined)}
                submitting={addComment.isPending}
                placeholder="Add a comment… Markdown is supported."
              />
            </div>
          </Card>
        </div>

        {/* -------------------------------------------------------- sidebar */}
        <div className="flex flex-col gap-4">
          <Card>
            <h3 className="text-xs font-medium text-[var(--ink-muted)]">Status</h3>
            <div className="mt-2">
              <TaskStatusBadge status={task.status} size="md" />
            </div>

            {nextStatuses.length > 0 && allows('task:transition') && (
              <div className="mt-3">
                <p className="mb-1.5 text-2xs text-[var(--ink-faint)]">Move to</p>
                <div className="flex flex-wrap gap-1.5">
                  {nextStatuses.map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={move.isPending}
                      onClick={() => move.mutate(status)}
                      className={cn(
                        'rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-1 text-2xs font-medium',
                        'text-[var(--ink-secondary)] transition-colors',
                        'hover:bg-[var(--accent-wash)] hover:text-[var(--accent)]',
                        'disabled:pointer-events-none disabled:opacity-50',
                      )}
                    >
                      {TASK_STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <dl className="flex flex-col gap-3 text-xs">
              <Detail label="Assignee">
                {task.assignee ? (
                  <UserChip user={task.assignee} showPresence />
                ) : (
                  <span className="text-[var(--ink-faint)]">Unassigned</span>
                )}
              </Detail>
              <Detail label="Reporter">
                <UserChip user={task.reporter} />
              </Detail>
              <Detail label="Priority"><PriorityBadge priority={task.priority} /></Detail>
              <Detail label="Type"><Badge tone="neutral">{titleCase(task.type)}</Badge></Detail>
              <Detail label="Estimate">
                {task.estimate !== null ? (
                  <span className="tabular-nums">{task.estimate} points</span>
                ) : (
                  <span className="text-[var(--ink-faint)]">Not estimated</span>
                )}
              </Detail>
              <Detail label="Due">
                <span
                  className={cn(
                    'tabular-nums',
                    due.tone === 'overdue' && 'font-medium text-[var(--status-critical-ink)]',
                    due.tone === 'today' && 'font-medium text-[var(--status-warning-ink)]',
                  )}
                >
                  {due.text}
                </span>
              </Detail>
              <Detail label="Time logged">
                <span className="tabular-nums">{duration(task.loggedMinutes)}</span>
              </Detail>
              {task.labels.length > 0 && (
                <Detail label="Labels">
                  <span className="flex flex-wrap gap-1">
                    {task.labels.map((label) => (
                      <Badge key={label} tone="neutral">{label}</Badge>
                    ))}
                  </span>
                </Detail>
              )}
              <Detail label="Created"><span>{dateTime(task.createdAt)}</span></Detail>
              {task.completedAt && (
                <Detail label="Completed"><span>{dateTime(task.completedAt)}</span></Detail>
              )}
            </dl>
          </Card>
        </div>
      </div>

      <EditTaskModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        task={task}
        onSave={(input) => update.mutateAsync(input).then(() => setEditOpen(false))}
        saving={update.isPending}
        canAssign={allows('task:assign')}
      />

      <LogTimeModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        taskId={id}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate(undefined as never)}
        title={`Delete ${task.reference}?`}
        message="This removes the task, its comments and its time logs. It cannot be undone."
        loading={remove.isPending}
      />
    </Page>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-2xs text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-[var(--ink-secondary)]">{children}</dd>
    </div>
  );
}

function EditTaskModal({
  open, onClose, task, onSave, saving, canAssign,
}: {
  open: boolean;
  onClose: () => void;
  task: Task;
  onSave: (input: Record<string, unknown>) => Promise<void>;
  saving: boolean;
  canAssign: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState(task.priority);
  const [estimate, setEstimate] = useState(task.estimate === null ? '' : String(task.estimate));
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${task.reference}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={saving}
            onClick={() =>
              void onSave({
                title,
                description: description || null,
                priority,
                estimate: estimate === '' ? null : Number(estimate),
                dueDate: dueDate || null,
                ...(canAssign ? { assigneeId } : {}),
              })
            }
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <TextArea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          hint="Markdown is supported."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
            {PRIORITIES.map((option) => (
              <option key={option} value={option}>{PRIORITY_LABEL[option]}</option>
            ))}
          </Select>
          <Select label="Estimate" value={estimate} onChange={(e) => setEstimate(e.target.value)}>
            <option value="">No estimate</option>
            {STORY_POINTS.map((points) => (
              <option key={points} value={points}>{points}</option>
            ))}
          </Select>
          <TextInput label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        {canAssign ? (
          <AssigneeSelect value={assigneeId} onChange={setAssigneeId} projectId={task.projectId} />
        ) : (
          <p className="rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2 text-2xs text-[var(--ink-muted)]">
            Only a team lead can reassign a task.
          </p>
        )}
      </div>
    </Modal>
  );
}

function LogTimeModal({ open, onClose, taskId }: { open: boolean; onClose: () => void; taskId: string }) {
  const [minutes, setMinutes] = useState('60');
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const log = useMutate(
    (input: unknown) => api.post(`/tasks/${taskId}/time`, input),
    {
      invalidates: [keys.task(taskId), ['dashboard']],
      successMessage: 'Time logged',
      onSuccess: () => {
        setNote('');
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log time"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={log.isPending}
            onClick={() => log.mutate({ minutes: Number(minutes), spentOn, note: note || undefined })}
          >
            Log
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Minutes"
            type="number"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <TextInput label="Date" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </div>
        {/* Quick picks, because most entries are round numbers. */}
        <div className="flex flex-wrap gap-1.5">
          {[15, 30, 60, 120, 240, 480].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setMinutes(String(preset))}
              className="rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-1 text-2xs font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--accent)]"
            >
              {duration(preset)}
            </button>
          ))}
        </div>
        <TextArea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What did you work on?" />
      </div>
    </Modal>
  );
}
