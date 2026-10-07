import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABEL, TASK_STATUSES, TASK_STATUS_LABEL,
  type Paginated, type Project, type ProjectMember, type Sprint, type Task,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { pluralise, relativeTime, shortDate } from '@/lib/format.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton, LinkButton } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge, ProjectStatusBadge } from '@/components/ui/Badge.jsx';
import { Progress, ProgressRing } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';
import { Stat, StatGrid } from '@/components/ui/Stat.jsx';
import { Tabs } from '@/components/ui/Tabs.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select } from '@/components/ui/Field.jsx';
import { DistributionBars, STATUS_SERIES } from '@/components/charts/index.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { MemberPicker } from '@/components/MemberPicker.jsx';
import { TaskRow } from './Tasks.jsx';
import {
  Bug, ChevronLeft, Kanban, Plus, Review, Sprint as SprintIcon, Target, Tasks as TasksIcon, Trash,
} from '@/components/icons.jsx';

/** Project overview: health, team, and the work inside it. */
export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { allows } = useAuth();
  const [tab, setTab] = useState('overview');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [removing, setRemoving] = useState<ProjectMember | null>(null);

  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: keys.project(id),
    queryFn: () => api.get<Project>(`/projects/${id}`),
    enabled: Boolean(id),
  });

  const { data: tasks } = useQuery({
    queryKey: keys.tasks({ projectId: id, pageSize: 50 }),
    queryFn: () => api.get<Paginated<Task>>('/tasks', { projectId: id, pageSize: '50' }),
    enabled: Boolean(id),
  });

  const { data: sprints } = useQuery({
    queryKey: keys.sprints(id),
    queryFn: () => api.get<Sprint[]>('/sprints', { projectId: id }),
    enabled: Boolean(id) && tab === 'sprints',
  });

  const updateStatus = useMutate(
    (status: string) => api.patch<Project>(`/projects/${id}`, { status }),
    { invalidates: [['projects'], ['dashboard']], successMessage: 'Project updated' },
  );

  const removeMember = useMutate(
    (userId: string) => api.delete<ProjectMember[]>(`/projects/${id}/members/${userId}`),
    {
      invalidates: [keys.project(id), ['projects']],
      successMessage: 'Member removed',
      onSuccess: () => setRemoving(null),
    },
  );

  if (isLoading) return <LoadingState className="min-h-[60vh]" label="Loading project" />;
  if (error || !project) {
    return (
      <Page title="Project">
        <ErrorState
          title="Project not found"
          message="It may have been deleted, or you may not be a member of it."
          onRetry={() => void refetch()}
        />
      </Page>
    );
  }

  const statusCounts = new Map<Task['status'], number>();
  for (const task of tasks?.items ?? []) {
    statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
  }
  const statusSlices = TASK_STATUSES
    .filter((status) => (statusCounts.get(status) ?? 0) > 0)
    .map((status) => ({ label: TASK_STATUS_LABEL[status], value: statusCounts.get(status)!, color: STATUS_SERIES[status] }));

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <Link to="/projects" aria-label="Back to projects" className="rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)] hover:text-[var(--ink-primary)]">
            <ChevronLeft size={16} />
          </Link>
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[11px] font-bold text-white"
            style={{ background: project.color }}
          >
            {project.key.slice(0, 2)}
          </span>
          <span className="min-w-0">{project.name}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xs">{project.key}</span>
          <span>· {pluralise(project.memberCount, 'member')}</span>
          {project.targetDate && <span>· target {shortDate(project.targetDate)}</span>}
          <span>· updated {relativeTime(project.updatedAt)}</span>
        </span>
      }
      actions={
        <>
          <LinkButton to={`/board?projectId=${id}`} variant="secondary" size="sm" icon={<Kanban size={14} />}>
            Board
          </LinkButton>
          {allows('project:update') && (
            <Select
              aria-label="Project status"
              value={project.status}
              onChange={(event) => updateStatus.mutate(event.target.value)}
              wrapperClassName="w-36"
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{PROJECT_STATUS_LABEL[status]}</option>
              ))}
            </Select>
          )}
        </>
      }
      toolbar={
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'tasks', label: 'Tasks', count: project.stats.totalTasks },
            { id: 'sprints', label: 'Sprints' },
            { id: 'team', label: 'Team', count: project.memberCount },
          ]}
        />
      }
    >
      {tab === 'overview' && (
        <div className="flex flex-col gap-5">
          <StatGrid>
            <Stat
              label="Progress"
              value={`${project.stats.progress}%`}
              hint={`${project.stats.doneTasks} of ${project.stats.totalTasks} tasks`}
              icon={<Target size={14} />}
            />
            <Stat label="Open tasks" value={project.stats.totalTasks - project.stats.doneTasks} icon={<TasksIcon size={14} />} to={`/tasks?projectId=${id}`} />
            <Stat label="Open issues" value={project.stats.openIssues} tone={project.stats.openIssues > 0 ? 'warning' : 'default'} icon={<Bug size={14} />} to={`/issues?projectId=${id}`} />
            <Stat label="Open reviews" value={project.stats.openReviews} icon={<Review size={14} />} to={`/code-review?projectId=${id}`} />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader title="About" action={<ProjectStatusBadge status={project.status} />} />
              <div className="mt-3">
                {project.description ? (
                  <Markdown content={project.description} />
                ) : (
                  <p className="text-xs text-[var(--ink-faint)] italic">No description yet.</p>
                )}
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--line-subtle)] pt-4 sm:grid-cols-3">
                {[
                  { label: 'Lead', value: project.lead ? project.lead.name : '—' },
                  { label: 'Started', value: project.startDate ? shortDate(project.startDate) : '—' },
                  { label: 'Target', value: project.targetDate ? shortDate(project.targetDate) : '—' },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-2xs text-[var(--ink-faint)]">{item.label}</dt>
                    <dd className="mt-0.5 truncate-line text-xs font-medium">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex items-center gap-4">
                  <ProgressRing value={project.stats.progress} size={56} thickness={5} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Delivery progress</p>
                    <p className="mt-0.5 text-2xs text-[var(--ink-muted)]">
                      {project.stats.doneTasks} of {project.stats.totalTasks} tasks complete
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <Progress value={project.stats.progress} />
                </div>
              </Card>

              <Card>
                <DistributionBars slices={statusSlices} title="Tasks by column" />
                {statusSlices.length === 0 && <EmptyState compact title="No tasks yet" />}
              </Card>
            </div>
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <Card padded={false} className="overflow-hidden">
          {!tasks ? (
            <LoadingState />
          ) : tasks.items.length === 0 ? (
            <EmptyState
              icon={<TasksIcon size={20} />}
              title="No tasks in this project"
              message="Create the first task to start tracking work."
            />
          ) : (
            <ul className="divide-y divide-[var(--line-subtle)]">
              {tasks.items.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'sprints' && (
        <Card>
          {!sprints ? (
            <LoadingState />
          ) : sprints.length === 0 ? (
            <EmptyState
              icon={<SprintIcon size={20} />}
              title="No sprints yet"
              message="Sprints group work into timeboxed iterations."
              action={<LinkButton to="/sprints?new=1" variant="primary">Create a sprint</LinkButton>}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {sprints.map((sprint) => (
                <li key={sprint.id} className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-2.5">
                  <Badge tone={sprint.status === 'ACTIVE' ? 'good' : sprint.status === 'PLANNED' ? 'info' : 'neutral'} dot>
                    {sprint.status.toLowerCase()}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate-line text-xs font-medium">{sprint.name}</span>
                    <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
                      {shortDate(sprint.startDate)} → {shortDate(sprint.endDate)}
                    </span>
                  </span>
                  <span className="w-24 shrink-0">
                    <Progress
                      value={sprint.committedPoints > 0 ? (sprint.completedPoints / sprint.committedPoints) * 100 : 0}
                      size="xs"
                      showLabel
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'team' && (
        <Card>
          <CardHeader
            title="Project team"
            subtitle="Only members can see this project's tasks, issues and files."
            action={
              allows('project:manage_members') && (
                <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setAddMemberOpen(true)}>
                  Add members
                </Button>
              )
            }
          />
          <ul className="mt-4 flex flex-col gap-1">
            {(project.members ?? []).map((member) => (
              <li
                key={member.user.id}
                className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wash-hover)]"
              >
                <Link to={`/team/${member.user.id}`} className="min-w-0 flex-1">
                  <UserChip user={member.user} subtitle={member.user.jobTitle ?? member.user.email} showPresence size="md" />
                </Link>
                <Badge tone={member.projectRole === 'LEAD' ? 'accent' : 'neutral'}>
                  {member.projectRole.toLowerCase()}
                </Badge>
                <span className="hidden w-24 shrink-0 text-right text-2xs text-[var(--ink-muted)] sm:block">
                  {pluralise(member.openTasks, 'open task')}
                </span>
                {allows('project:manage_members') && (
                  <IconButton label={`Remove ${member.user.name}`} size="sm" onClick={() => setRemoving(member)}>
                    <Trash size={13} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AddMembersModal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} projectId={id} existing={(project.members ?? []).map((m) => m.user.id)} />

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeMember.mutate(removing.user.id)}
        title={`Remove ${removing?.user.name ?? ''}?`}
        message="They lose access to this project. Their open tasks here are unassigned rather than deleted."
        confirmLabel="Remove"
        loading={removeMember.isPending}
      />
    </Page>
  );
}

function AddMembersModal({
  open, onClose, projectId, existing,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  existing: string[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [role, setRole] = useState<'LEAD' | 'MEMBER' | 'VIEWER'>('MEMBER');

  const add = useMutate(
    async (userIds: string[]) => {
      // The API adds one member per call, so a batch is sequential. Kept
      // sequential rather than parallel so a partial failure is easy to read.
      for (const userId of userIds) {
        await api.post(`/projects/${projectId}/members`, { userId, projectRole: role });
      }
    },
    {
      invalidates: [keys.project(projectId), ['projects']],
      successMessage: 'Members added',
      onSuccess: () => {
        setSelected([]);
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add members"
      description="New members immediately gain access to this project's work."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={add.isPending} disabled={selected.length === 0} onClick={() => add.mutate(selected)}>
            Add {selected.length > 0 ? selected.length : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Project role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="MEMBER">Member — can work on tasks</option>
          <option value="LEAD">Lead — manages the project</option>
          <option value="VIEWER">Viewer — read only</option>
        </Select>
        <MemberPicker
          label="People"
          selected={selected}
          onChange={setSelected}
          hint={existing.length > 0 ? 'Existing members are added again harmlessly — their role is updated.' : undefined}
        />
      </div>
    </Modal>
  );
}
