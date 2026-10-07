import { useEffect, useState } from 'react';
import {
  PRIORITIES, PRIORITY_LABEL, STORY_POINTS, TASK_STATUSES, TASK_STATUS_LABEL,
  TASK_TYPES, createTaskSchema, type Task,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { titleCase } from '@/lib/format.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Modal } from './ui/Modal.jsx';
import { Button } from './ui/Button.jsx';
import { Select, TextArea, TextInput } from './ui/Field.jsx';
import { AssigneeSelect } from './MemberPicker.jsx';
import { cn } from '@/lib/cn.js';

/**
 * Task composer.
 *
 * One modal for creating a task, used from the list, the board and the command
 * palette. The project must be chosen first because the assignee list and the
 * sprint list both depend on it — the API rejects an assignee who is not a
 * project member, so the form must not offer one.
 */
export function TaskComposer({
  open,
  onClose,
  defaultProjectId,
  defaultStatus,
  defaultSprintId,
  defaultTitle,
  defaultDueDate,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  defaultStatus?: Task['status'];
  defaultSprintId?: string;
  /** Carried over from a quick-add field, so opening details keeps the text. */
  defaultTitle?: string;
  /** YYYY-MM-DD, e.g. the calendar day the form was opened from. */
  defaultDueDate?: string;
  onCreated?: (task: Task) => void;
}) {
  const { data: projects } = useProjectOptions();

  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<Task['type']>('FEATURE');
  const [status, setStatus] = useState<Task['status']>(defaultStatus ?? 'TODO');
  const [priority, setPriority] = useState<Task['priority']>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Default to the only project the user has, which removes a pointless choice.
  useEffect(() => {
    if (!open) return;
    setProjectId(defaultProjectId ?? (projects?.length === 1 ? projects[0]!.id : ''));
    setStatus(defaultStatus ?? 'TODO');
    if (defaultTitle) setTitle(defaultTitle);
    if (defaultDueDate) setDueDate(defaultDueDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per open, not on every keystroke upstream
  }, [open, defaultProjectId, defaultStatus, projects]);

  const reset = () => {
    setTitle(''); setDescription(''); setType('FEATURE'); setPriority('MEDIUM');
    setAssigneeId(null); setEstimate(''); setDueDate(''); setLabels([]); setLabelInput('');
    setErrors({});
  };

  const create = useMutate((input: unknown) => api.post<Task>('/tasks', input), {
    invalidates: [['tasks'], ['dashboard'], ['projects'], ['sprints']],
    successMessage: (task) => `${task.reference} created`,
    errorMessage: 'Could not create the task',
    onSuccess: (task) => {
      reset();
      onClose();
      onCreated?.(task);
    },
  });

  const addLabel = () => {
    const value = labelInput.trim().slice(0, 32);
    if (value && !labels.includes(value) && labels.length < 12) setLabels([...labels, value]);
    setLabelInput('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = createTaskSchema.safeParse({
      projectId,
      title,
      description: description || undefined,
      type,
      status,
      priority,
      assigneeId: assigneeId ?? undefined,
      sprintId: defaultSprintId ?? undefined,
      estimate: estimate === '' ? undefined : Number(estimate),
      dueDate: dueDate || undefined,
      labels,
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
      title="New task"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending} disabled={!projectId}>
            Create task
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Select
          label="Project"
          required
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            // The previous assignee may not be a member of the new project.
            setAssigneeId(null);
          }}
          error={errors.projectId}
          hint={!projectId ? 'Choose a project to enable the rest of the form.' : undefined}
        >
          <option value="">Select a project…</option>
          {(projects ?? []).map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} ({project.key})
            </option>
          ))}
        </Select>

        <TextInput
          label="Title"
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={errors.title}
          placeholder="What needs doing?"
          maxLength={200}
          aside={`${title.length}/200`}
        />

        <TextArea
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          rows={5}
          placeholder={'## Context\n\n## Acceptance criteria\n\n- [ ] '}
          hint="Markdown is supported."
          className="font-mono text-xs"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Type" value={type} onChange={(event) => setType(event.target.value as Task['type'])}>
            {TASK_TYPES.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </Select>
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value as Task['status'])}>
            {TASK_STATUSES.map((option) => (
              <option key={option} value={option}>{TASK_STATUS_LABEL[option]}</option>
            ))}
          </Select>
          <Select
            label="Priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Task['priority'])}
          >
            {PRIORITIES.map((option) => (
              <option key={option} value={option}>{PRIORITY_LABEL[option]}</option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <AssigneeSelect
            value={assigneeId}
            onChange={setAssigneeId}
            projectId={projectId || undefined}
            disabled={!projectId}
          />
          <Select label="Estimate" value={estimate} onChange={(event) => setEstimate(event.target.value)}>
            <option value="">No estimate</option>
            {STORY_POINTS.map((points) => (
              <option key={points} value={points}>{points} {points === 1 ? 'point' : 'points'}</option>
            ))}
          </Select>
          <TextInput
            label="Due date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            error={errors.dueDate}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--ink-secondary)]">Labels</span>
          {labels.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => setLabels(labels.filter((l) => l !== label))}
                    className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-3)] px-2 py-0.5 text-2xs text-[var(--ink-secondary)] transition-colors hover:bg-[var(--status-critical-wash)] hover:text-[var(--status-critical-ink)]"
                  >
                    {label}
                    <span aria-hidden="true">×</span>
                    <span className="sr-only-focusable">Remove label</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={labelInput}
            onChange={(event) => setLabelInput(event.target.value)}
            // Enter adds a label rather than submitting the form, which would
            // be a surprise mid-way through filling it in.
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addLabel();
              }
            }}
            onBlur={addLabel}
            placeholder="Type a label and press Enter"
            aria-label="Add a label"
            className={cn(
              'h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 text-sm',
              'ring-1 ring-inset ring-[var(--line)] placeholder:text-[var(--ink-faint)]',
              'focus:ring-2 focus:ring-[var(--accent)] focus:outline-none',
            )}
          />
        </div>
      </form>
    </Modal>
  );
}
