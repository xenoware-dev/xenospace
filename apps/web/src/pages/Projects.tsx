import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  PROJECT_STATUSES, PROJECT_STATUS_LABEL, createProjectSchema,
  type Paginated, type Project,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { daysUntil, number, pluralise, relativeTime, shortDate } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { AvatarStack } from '@/components/ui/Avatar.jsx';
import { Badge, ProjectStatusBadge } from '@/components/ui/Badge.jsx';
import { Progress, ProgressRing } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ClearFilters, FilterSelect, Pagination, SearchField, ToolbarSpacer } from '@/components/ui/Toolbar.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { Modal } from '@/components/ui/Modal.jsx';
import { Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { Bug, Plus, Projects as ProjectsIcon, Review, Tasks } from '@/components/icons.jsx';
import { MemberPicker } from '@/components/MemberPicker.jsx';

/**
 * Projects.
 *
 * A grid of cards by default, which suits browsing and shows progress at a
 * glance; a table for scanning many projects by date or status. The view choice
 * is remembered per user.
 */
/**
 * A reference key from a project name: initials for several words ("Orbit
 * Mobile" → OM), the start of the word for one ("xenoschool" → XENO). Keys need
 * at least two characters and must start with a letter, so one initial alone
 * ("X") is padded from the first word.
 */
export function deriveProjectKey(name: string): string {
  // A key must start with a letter, so leading digits never begin a word here.
  const words = name.toUpperCase().split(/[^A-Z0-9]+/).map((w) => w.replace(/^[0-9]+/, '')).filter(Boolean);
  if (words.length === 0) return '';
  let key = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : words[0]!.slice(0, 4);
  if (key.length < 2) key = (key + words[0]!.slice(1)).slice(0, 4);
  return key;
}

export function ProjectsPage() {
  const { allows, isAdmin } = useAuth();
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('xs-projects-view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [createOpen, setCreateOpen] = useQueryFlag('new');

  const { filters, setFilter, clear, activeCount } = useFilters({
    q: '',
    status: '',
    sort: 'updatedAt',
    page: '1',
  });

  const query = {
    q: filters.q || undefined,
    status: filters.status || undefined,
    sort: filters.sort,
    page: filters.page,
    pageSize: '24',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.projects(query),
    queryFn: () => api.get<Paginated<Project>>('/projects', query),
  });

  const changeView = (next: 'grid' | 'list') => {
    setView(next);
    try {
      localStorage.setItem('xs-projects-view', next);
    } catch {
      /* preference is session-only when storage is unavailable */
    }
  };

  return (
    <Page
      title={isAdmin ? 'Projects' : 'My Projects'}
      description={
        isAdmin
          ? 'Every project in the workspace, with progress and open work.'
          : 'The projects you are a member of.'
      }
      actions={
        allows('project:create') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            New project
          </Button>
        )
      }
      toolbar={
        <>
          <SearchField
            value={filters.q}
            onChange={(value) => setFilter('q', value)}
            placeholder="Search projects…"
            className="w-full sm:w-64"
          />
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(value) => setFilter('status', value)}
            options={PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABEL[status] }))}
          />
          <FilterSelect
            label="Sort"
            value={filters.sort === 'updatedAt' ? '' : filters.sort}
            onChange={(value) => setFilter('sort', value || 'updatedAt')}
            options={[
              { value: 'name', label: 'Name' },
              { value: 'createdAt', label: 'Created' },
              { value: 'targetDate', label: 'Target date' },
            ]}
          />
          <ClearFilters count={activeCount} onClear={clear} />
          <ToolbarSpacer />
          <SegmentedControl
            value={view}
            onChange={changeView}
            size="sm"
            options={[
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
            ]}
          />
        </>
      }
    >
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Projects could not be loaded." onRetry={() => void refetch()} />
      ) : data!.items.length === 0 ? (
        <EmptyState
          icon={<ProjectsIcon size={20} />}
          title={activeCount > 0 ? 'No projects match those filters' : 'No projects yet'}
          message={
            activeCount > 0
              ? 'Try widening or clearing the filters.'
              : allows('project:create')
                ? 'Create your first project to start planning work.'
                : 'You have not been added to a project yet. Ask your team lead for access.'
          }
          action={
            activeCount > 0 ? (
              <Button variant="secondary" onClick={clear}>Clear filters</Button>
            ) : allows('project:create') ? (
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
                New project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {view === 'grid' ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xs-stagger">
              {data!.items.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </ul>
          ) : (
            <ProjectTable projects={data!.items} />
          )}

          <Pagination
            page={data!.page}
            totalPages={data!.totalPages}
            total={data!.total}
            pageSize={data!.pageSize}
            onPageChange={(next) => setFilter('page', String(next))}
          />
        </>
      )}

      <CreateProjectModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const due = daysUntil(project.targetDate);
  const atRisk = due !== null && due < 0 && project.stats.progress < 100;

  return (
    <Card as="li" interactive className="group relative overflow-hidden p-0">
      {/* A top edge in the project colour makes the grid scannable by project. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: project.color }} />

      <Link to={`/projects/${project.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[10px] font-bold text-white"
                style={{ background: project.color }}
              >
                {project.key.slice(0, 2)}
              </span>
              <h3 className="truncate-line text-sm font-semibold text-[var(--ink-primary)]">
                {project.name}
              </h3>
            </div>
            {project.description && (
              <p className="mt-1.5 line-clamp-2 text-2xs leading-relaxed text-[var(--ink-muted)]">
                {project.description}
              </p>
            )}
          </div>
          <ProgressRing value={project.stats.progress} size={38} tone={atRisk ? 'warning' : 'accent'} />
        </div>

        <div className="mt-3">
          <Progress value={project.stats.progress} size="xs" tone={atRisk ? 'warning' : 'accent'} />
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2">
          {[
            { icon: <Tasks size={11} />, label: 'Tasks', value: `${project.stats.doneTasks}/${project.stats.totalTasks}` },
            { icon: <Bug size={11} />, label: 'Issues', value: number(project.stats.openIssues) },
            { icon: <Review size={11} />, label: 'Reviews', value: number(project.stats.openReviews) },
          ].map((item) => (
            <div key={item.label} className="rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-2 py-1.5">
              <dt className="flex items-center gap-1 text-[10px] text-[var(--ink-faint)]">
                {item.icon}
                {item.label}
              </dt>
              <dd className="mt-0.5 text-xs font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--line-subtle)] pt-3">
          <div className="flex items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            {atRisk && (
              <Badge tone="warning" dot>
                {Math.abs(due!)}d overdue
              </Badge>
            )}
          </div>
          {project.lead && <AvatarStack users={[project.lead]} size="sm" />}
        </div>
      </Link>
    </Card>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <ul className="divide-y divide-[var(--line-subtle)]">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              to={`/projects/${project.id}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--wash-hover)]"
            >
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[10px] font-bold text-white"
                style={{ background: project.color }}
              >
                {project.key.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate-line text-xs font-medium">{project.name}</span>
                <span className="mt-0.5 block text-2xs text-[var(--ink-faint)]">
                  {project.key} · {pluralise(project.memberCount, 'member')} · updated {relativeTime(project.updatedAt)}
                </span>
              </span>
              <span className="hidden w-32 shrink-0 md:block">
                <Progress value={project.stats.progress} size="xs" showLabel />
              </span>
              <span className="hidden w-20 shrink-0 text-right text-2xs text-[var(--ink-muted)] lg:block">
                {project.targetDate ? shortDate(project.targetDate) : '—'}
              </span>
              <ProjectStatusBadge status={project.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------- create form */

function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Project['status']>('PLANNING');
  const [color, setColor] = useState('#6366f1');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName(''); setKey(''); setDescription(''); setStatus('PLANNING');
    setColor('#6366f1'); setStartDate(''); setTargetDate(''); setMemberIds([]); setErrors({});
  };

  const create = useMutate(
    (input: unknown) => api.post<Project>('/projects', input),
    {
      invalidates: [['projects'], ['dashboard']],
      successMessage: 'Project created',
      errorMessage: 'Could not create the project',
      onSuccess: () => {
        reset();
        onClose();
      },
    },
  );

  /**
   * Derives the project key from the name, which is what people expect — but
   * only until they type their own, so an edit is never overwritten.
   */
  const [keyTouched, setKeyTouched] = useState(false);
  const onNameChange = (value: string) => {
    setName(value);
    if (!keyTouched) {
      setKey(deriveProjectKey(value));
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = createProjectSchema.safeParse({
      name, key, description: description || undefined, status, color,
      startDate: startDate || undefined,
      targetDate: targetDate || undefined,
      memberIds: memberIds.length > 0 ? memberIds : undefined,
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

  const PALETTE = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      description="Projects hold tasks, sprints, issues and repositories."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>Create project</Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextInput
            label="Project name"
            required
            autoFocus
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            error={errors.name}
            placeholder="Orbit Mobile"
          />
          <TextInput
            label="Key"
            required
            value={key}
            onChange={(event) => {
              setKeyTouched(true);
              setKey(event.target.value.toUpperCase());
            }}
            error={errors.key}
            maxLength={8}
            placeholder="ORB"
            hint="Used in references"
            className="font-mono uppercase"
          />
        </div>

        <TextArea
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          rows={3}
          placeholder="What is this project for?"
          aside={`${description.length}/2000`}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Project['status'])}
          >
            {PROJECT_STATUSES.filter((s) => s !== 'ARCHIVED').map((option) => (
              <option key={option} value={option}>{PROJECT_STATUS_LABEL[option]}</option>
            ))}
          </Select>
          <TextInput
            label="Start date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            error={errors.startDate}
          />
          <TextInput
            label="Target date"
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
            error={errors.targetDate}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--ink-secondary)]">Colour</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Project colour">
            {PALETTE.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={`Colour ${option}`}
                onClick={() => setColor(option)}
                className={cn(
                  'size-7 rounded-[var(--radius-sm)] transition-transform',
                  color === option
                    ? 'scale-110 ring-2 ring-[var(--ink-primary)] ring-offset-2 ring-offset-[var(--surface-1)]'
                    : 'hover:scale-105',
                )}
                style={{ background: option }}
              />
            ))}
          </div>
        </div>

        <MemberPicker
          label="Team members"
          hint="The lead is added automatically."
          selected={memberIds}
          onChange={setMemberIds}
        />
      </form>
    </Modal>
  );
}
