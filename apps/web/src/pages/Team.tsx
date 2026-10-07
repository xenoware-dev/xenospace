import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ROLES, ROLE_LABEL, USER_STATUSES, inviteSchema,
  type Paginated, type PublicUser, type Role,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { duration, pluralise, relativeTime, shortDate, titleCase } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useMutate } from '@/hooks/useMutate.js';
import { useToast } from '@/components/ui/Toast.jsx';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Progress } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { LoadingState, Skeleton } from '@/components/ui/Spinner.jsx';
import { Stat, StatGrid } from '@/components/ui/Stat.jsx';
import { Tabs } from '@/components/ui/Tabs.jsx';
import { ConfirmDialog, Modal } from '@/components/ui/Modal.jsx';
import { Select, TextInput } from '@/components/ui/Field.jsx';
import { ClearFilters, FilterSelect, Pagination, SearchField } from '@/components/ui/Toolbar.jsx';
import { Bug, ChevronLeft, Link as LinkIcon, Plus, Shield, Tasks, Team as TeamIcon, Trash } from '@/components/icons.jsx';

interface MemberSummary extends PublicUser {
  skills: string[];
  weeklyHours: number;
  openTasks: number;
  doneTasks: number;
  openIssues: number;
  projectCount: number;
  loggedMinutesThisWeek: number;
  createdAt: string;
}

/**
 * Team members.
 *
 * Team-lead only, and the one page where roles are changed. Role and status
 * controls are deliberately separated from the directory listing — changing
 * someone's access should not be a one-click action next to their name.
 */
export function TeamPage() {
  const { allows, user } = useAuth();
  const [tab, setTab] = useState('members');
  const [inviteOpen, setInviteOpen] = useQueryFlag('invite');

  const { filters, setFilter, clear, activeCount } = useFilters({
    q: '', role: '', status: '', sort: 'name', order: 'asc', page: '1',
  });

  const query = {
    q: filters.q || undefined,
    role: filters.role || undefined,
    status: filters.status || undefined,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    pageSize: '30',
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.members(query),
    queryFn: () => api.get<Paginated<MemberSummary>>('/members', query),
  });

  const { data: invitations } = useQuery({
    queryKey: keys.invitations,
    queryFn: () => api.get<Array<{ id: string; email: string; role: Role; expiresAt: string; createdAt: string; expired: boolean }>>('/members/invitations'),
    enabled: allows('member:invite'),
  });

  const admins = data?.items.filter((member) => member.role === 'ADMIN').length ?? 0;
  const developers = data?.items.filter((member) => member.role === 'DEVELOPER').length ?? 0;
  const online = data?.items.filter((member) => member.presence === 'ONLINE').length ?? 0;

  return (
    <Page
      title="Team Members"
      description="Who is on the team, what they are working on, and what access they have."
      actions={
        allows('member:invite') && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setInviteOpen(true)}>
            Add a member
          </Button>
        )
      }
      toolbar={
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'members', label: 'Members', count: data?.total },
            ...(allows('member:invite')
              ? [{ id: 'invitations', label: 'Pending invitations', count: invitations?.length, countTone: 'warning' as const }]
              : []),
          ]}
        />
      }
    >
      {tab === 'members' && (
        <div className="flex flex-col gap-4">
          <StatGrid>
            <Stat label="Team size" value={data?.total ?? 0} icon={<TeamIcon size={14} />} />
            <Stat label="Team leads" value={admins} icon={<Shield size={14} />} />
            <Stat label="Developers" value={developers} />
            <Stat label="Online now" value={online} tone={online > 0 ? 'good' : 'default'} />
          </StatGrid>

          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={filters.q}
              onChange={(value) => setFilter('q', value)}
              placeholder="Search by name, email or title…"
              className="w-full sm:w-64"
            />
            <FilterSelect
              label="Role"
              value={filters.role}
              onChange={(value) => setFilter('role', value)}
              options={ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
              options={USER_STATUSES.map((status) => ({ value: status, label: titleCase(status) }))}
            />
            <FilterSelect
              label="Sort"
              value={filters.sort === 'name' ? '' : filters.sort}
              onChange={(value) => setFilter('sort', value || 'name')}
              options={[
                { value: 'openTasks', label: 'Workload' },
                { value: 'createdAt', label: 'Joined' },
              ]}
            />
            <ClearFilters count={activeCount} onClear={clear} />
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-36" />)}
            </div>
          ) : error ? (
            <ErrorState message="The team could not be loaded." onRetry={() => void refetch()} />
          ) : data!.items.length === 0 ? (
            <EmptyState
              icon={<TeamIcon size={20} />}
              title="Nobody matches those filters"
              action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}
            />
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 xs-stagger">
                {data!.items.map((member) => (
                  <MemberCard key={member.id} member={member} isSelf={member.id === user?.id} />
                ))}
              </ul>
              <Pagination
                page={data!.page}
                totalPages={data!.totalPages}
                total={data!.total}
                pageSize={data!.pageSize}
                onPageChange={(next) => setFilter('page', String(next))}
              />
            </>
          )}
        </div>
      )}

      {tab === 'invitations' && <InvitationsPanel invitations={invitations ?? []} />}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </Page>
  );
}

function MemberCard({ member, isSelf }: { member: MemberSummary; isSelf: boolean }) {
  // Rough load, using the same ~6 hours-per-point assumption as the dashboard.
  const capacity = Math.max(1, Math.round(member.weeklyHours / 6));
  const load = Math.round((member.openTasks / capacity) * 100);

  return (
    <Card as="li" interactive className="p-0">
      <Link to={`/team/${member.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          <Avatar user={member} size="lg" showPresence />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate-line text-sm font-semibold">{member.name}</h3>
              {isSelf && <Badge tone="accent" size="sm">You</Badge>}
            </div>
            <p className="truncate-line text-2xs text-[var(--ink-muted)]">
              {member.jobTitle ?? member.email}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge tone={member.role === 'ADMIN' ? 'accent' : 'neutral'} size="sm">
                {ROLE_LABEL[member.role]}
              </Badge>
              {member.status !== 'ACTIVE' && (
                <Badge tone="warning" size="sm" dot>{titleCase(member.status)}</Badge>
              )}
            </div>
          </div>
        </div>

        {member.skills.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1">
            {member.skills.slice(0, 4).map((skill) => (
              <li key={skill}>
                <Badge tone="neutral" size="sm">{skill}</Badge>
              </li>
            ))}
            {member.skills.length > 4 && (
              <li className="text-2xs text-[var(--ink-faint)]">+{member.skills.length - 4}</li>
            )}
          </ul>
        )}

        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--line-subtle)] pt-3">
          {[
            { label: 'Open', value: member.openTasks },
            { label: 'Done', value: member.doneTasks },
            { label: 'Projects', value: member.projectCount },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[10px] text-[var(--ink-faint)]">{item.label}</dt>
              <dd className="text-xs font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-2.5">
          <div className="mb-1 flex items-baseline justify-between text-[10px] text-[var(--ink-faint)]">
            <span>Workload</span>
            <span className="tabular-nums">{duration(member.loggedMinutesThisWeek)} this week</span>
          </div>
          <Progress
            value={Math.min(100, load)}
            size="xs"
            tone={load > 100 ? 'critical' : load > 80 ? 'warning' : 'accent'}
            label={`${member.name} workload`}
          />
        </div>
      </Link>
    </Card>
  );
}

function InvitationsPanel({
  invitations,
}: {
  invitations: Array<{ id: string; email: string; role: Role; expiresAt: string; createdAt: string; expired: boolean }>;
}) {
  const revoke = useMutate((id: string) => api.delete(`/members/invitations/${id}`), {
    invalidates: [keys.invitations],
    successMessage: 'Invitation revoked',
  });

  if (invitations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Plus size={18} />}
          title="No pending invitations"
          message="Invitations you send appear here until they are accepted."
          compact
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <ul className="divide-y divide-[var(--line-subtle)]">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--ink-muted)]">
              <Plus size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate-line text-xs font-medium">{invitation.email}</span>
              <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
                Invited {relativeTime(invitation.createdAt)} ·{' '}
                {invitation.expired ? 'expired' : `expires ${shortDate(invitation.expiresAt)}`}
              </span>
            </span>
            <Badge tone={invitation.role === 'ADMIN' ? 'accent' : 'neutral'}>{ROLE_LABEL[invitation.role]}</Badge>
            {invitation.expired && <Badge tone="warning" dot>Expired</Badge>}
            <IconButton
              label={`Revoke invitation for ${invitation.email}`}
              size="sm"
              loading={revoke.isPending}
              onClick={() => revoke.mutate(invitation.id)}
            >
              <Trash size={13} />
            </IconButton>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  // How people get in decides the wording: a Google-only workspace has no
  // link to pass on, the person just signs in with the address added here.
  const { data: providers } = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => api.get<{ password: boolean; leadPinned?: boolean }>('/auth/providers'),
    staleTime: 5 * 60_000,
  });
  const googleOnly = providers ? !providers.password : false;
  const leadPinned = Boolean(providers?.leadPinned);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [link, setLink] = useState<string | null>(null);

  const invite = useMutate(
    (input: unknown) => api.post<{ id: string; email: string; inviteLink?: string }>('/members/invitations', input),
    {
      invalidates: [keys.invitations],
      errorMessage: 'Could not send the invitation',
      onSuccess: (result) => {
        setEmail('');
        setProjectIds([]);
        setErrors({});
        // No mail transport is wired up, so the link is surfaced for the lead
        // to pass on rather than silently lost.
        if (result.inviteLink) setLink(result.inviteLink);
        else if (googleOnly) {
          toast.success('Member added', `${result.email} can now sign in with Google.`);
          onClose();
        } else toast.success('Invitation sent', `${result.email} will receive a link.`);
      },
    },
  );

  const submit = () => {
    const parsed = inviteSchema.safeParse({
      email, role: leadPinned ? 'DEVELOPER' : role, projectIds: projectIds.length > 0 ? projectIds : undefined,
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
    invite.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setLink(null);
        onClose();
      }}
      title={googleOnly ? 'Add a team member' : 'Invite a team member'}
      description={
        googleOnly
          ? 'Enter their Gmail address. They sign in with Google using exactly this address; any other account is turned away.'
          : 'They set their own password when they accept.'
      }
      footer={
        link ? (
          <Button variant="primary" onClick={() => { setLink(null); onClose(); }}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} loading={invite.isPending}>
              {googleOnly ? 'Add member' : 'Send invitation'}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--ink-secondary)]">
            Invitation created. Email delivery is not configured in this environment, so share this link directly:
          </p>
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--surface-inset)] p-2">
            <code className="min-w-0 flex-1 truncate-line font-mono text-2xs">{link}</code>
            <Button
              size="sm"
              variant="secondary"
              icon={<LinkIcon size={12} />}
              onClick={() => {
                void navigator.clipboard.writeText(link).then(
                  () => toast.success('Link copied'),
                  () => toast.error('Could not copy', 'Select the link and copy it manually.'),
                );
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-2xs text-[var(--ink-faint)]">The link expires in 30 days and can only be used once.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TextInput
            label={googleOnly ? 'Gmail address' : 'Email'}
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={errors.email}
            placeholder={googleOnly ? 'name@gmail.com' : 'colleague@company.com'}
          />
          {!leadPinned && (
          <Select
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            hint={
              role === 'ADMIN'
                ? 'A team lead has full access: projects, members, deployments and the audit log.'
                : 'A developer sees only the projects they are a member of.'
            }
          >
            {ROLES.map((option) => (
              <option key={option} value={option}>{ROLE_LABEL[option]}</option>
            ))}
          </Select>
          )}
          <MemberPickerProjects selected={projectIds} onChange={setProjectIds} />
        </div>
      )}
    </Modal>
  );
}

/** Project multi-select for an invitation. */
function MemberPickerProjects({
  selected, onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: projects } = useQuery({
    queryKey: keys.projectOptions,
    queryFn: () => api.get<Array<{ id: string; name: string; key: string; color: string }>>('/projects/options'),
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--ink-secondary)]">Add to projects</span>
      <div className="max-h-40 overflow-y-auto rounded-[var(--radius-md)] ring-1 ring-inset ring-[var(--line-subtle)]">
        {!projects || projects.length === 0 ? (
          <p className="px-3 py-5 text-center text-2xs text-[var(--ink-muted)]">No projects yet.</p>
        ) : (
          <ul>
            {projects.map((project) => {
              const isSelected = selected.includes(project.id);
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      onChange(isSelected ? selected.filter((id) => id !== project.id) : [...selected, project.id])
                    }
                    className={cn(
                      'flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-xs transition-colors',
                      isSelected ? 'bg-[var(--wash-selected)]' : 'hover:bg-[var(--wash-hover)]',
                    )}
                  >
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ background: project.color }} />
                    <span className="min-w-0 flex-1 truncate-line">{project.name}</span>
                    <span className="font-mono text-2xs text-[var(--ink-faint)]">{project.key}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-2xs text-[var(--ink-muted)]">Optional — they can be added later.</p>
    </div>
  );
}

/* ------------------------------------------------------------ member detail */

export function MemberDetailPage() {
  const { id = '' } = useParams();
  const { allows, user } = useAuth();
  const [confirmStatus, setConfirmStatus] = useState<'SUSPENDED' | 'DEACTIVATED' | null>(null);

  const { data: member, isLoading, error, refetch } = useQuery({
    queryKey: keys.member(id),
    queryFn: () =>
      api.get<MemberSummary & { projects: Array<{ id: string; name: string; key: string; color: string; projectRole: string }> }>(
        `/members/${id}`,
      ),
    enabled: Boolean(id),
  });

  const changeRole = useMutate((role: Role) => api.put<PublicUser>(`/members/${id}/role`, { role }), {
    invalidates: [keys.member(id), ['members']],
    successMessage: 'Role updated',
  });

  const changeStatus = useMutate(
    (status: string) => api.put<PublicUser>(`/members/${id}/status`, { status }),
    {
      invalidates: [keys.member(id), ['members']],
      successMessage: 'Status updated',
      onSuccess: () => setConfirmStatus(null),
    },
  );

  if (isLoading) return <LoadingState className="min-h-[60vh]" label="Loading profile" />;
  if (error || !member) {
    return (
      <Page title="Member">
        <ErrorState title="Member not found" message="They may have been removed, or you may not share a project." onRetry={() => void refetch()} />
      </Page>
    );
  }

  const isSelf = member.id === user?.id;

  return (
    <Page
      title={
        <span className="flex items-center gap-2.5">
          <Link to="/team" aria-label="Back to team" className="rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--wash-hover)]">
            <ChevronLeft size={16} />
          </Link>
          <span>{member.name}</span>
        </span>
      }
      description={member.jobTitle ?? member.email}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <StatGrid className="sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Open tasks" value={member.openTasks} icon={<Tasks size={14} />} />
            <Stat label="Completed" value={member.doneTasks} tone="good" />
            <Stat label="Open issues" value={member.openIssues} icon={<Bug size={14} />} tone={member.openIssues > 0 ? 'warning' : 'default'} />
            <Stat label="Logged this week" value={duration(member.loggedMinutesThisWeek)} />
          </StatGrid>

          <Card>
            <CardHeader title="Projects" subtitle={pluralise(member.projects.length, 'project')} />
            {member.projects.length === 0 ? (
              <EmptyState compact title="Not on any project yet" />
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {member.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to={`/projects/${project.id}`}
                      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-3 py-2 transition-colors hover:bg-[var(--surface-3)]"
                    >
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ background: project.color }} />
                      <span className="min-w-0 flex-1 truncate-line text-xs font-medium">{project.name}</span>
                      <Badge tone={project.projectRole === 'LEAD' ? 'accent' : 'neutral'} size="sm">
                        {project.projectRole.toLowerCase()}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {member.skills.length > 0 && (
            <Card>
              <CardHeader title="Skills" />
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {member.skills.map((skill) => (
                  <li key={skill}><Badge tone="neutral" size="md">{skill}</Badge></li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <Avatar user={member} size="xl" showPresence />
              <div>
                <p className="text-md font-semibold">{member.name}</p>
                <p className="text-2xs text-[var(--ink-muted)]">{member.email}</p>
              </div>
              <Badge tone={member.role === 'ADMIN' ? 'accent' : 'neutral'} size="md">
                {ROLE_LABEL[member.role]}
              </Badge>
            </div>

            <dl className="mt-4 flex flex-col gap-2.5 border-t border-[var(--line-subtle)] pt-4 text-xs">
              <Row label="Status">
                <Badge tone={member.status === 'ACTIVE' ? 'good' : 'warning'} dot>{titleCase(member.status)}</Badge>
              </Row>
              <Row label="Weekly hours"><span className="tabular-nums">{member.weeklyHours}h</span></Row>
              <Row label="Joined"><span>{shortDate(member.createdAt)}</span></Row>
              <Row label="Last seen"><span>{member.lastSeenAt ? relativeTime(member.lastSeenAt) : '—'}</span></Row>
            </dl>
          </Card>

          {allows('member:update_role') && !isSelf && (
            <Card>
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-muted)]">
                <Shield size={12} />
                Access
              </h3>
              <div className="mt-3 flex flex-col gap-3">
                <Select
                  label="Workspace role"
                  value={member.role}
                  onChange={(event) => changeRole.mutate(event.target.value as Role)}
                  hint="Changing this signs them out of their open sessions."
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                  ))}
                </Select>

                {member.status === 'ACTIVE' ? (
                  <Button variant="danger" size="sm" fullWidth onClick={() => setConfirmStatus('SUSPENDED')}>
                    Suspend access
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    loading={changeStatus.isPending}
                    onClick={() => changeStatus.mutate('ACTIVE')}
                  >
                    Restore access
                  </Button>
                )}
              </div>
            </Card>
          )}

          {isSelf && (
            <Card>
              <p className="text-2xs leading-relaxed text-[var(--ink-muted)]">
                This is your own profile. Edit your details in{' '}
                <Link to="/settings" className="font-medium text-[var(--accent)] hover:underline">Settings</Link>.
              </p>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmStatus !== null}
        onClose={() => setConfirmStatus(null)}
        onConfirm={() => confirmStatus && changeStatus.mutate(confirmStatus)}
        title={`Suspend ${member.name}?`}
        message="Every session is revoked immediately and they cannot sign in. Their work and history are kept."
        confirmLabel="Suspend"
        loading={changeStatus.isPending}
      />
    </Page>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-2xs text-[var(--ink-muted)]">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-[var(--ink-secondary)]">{children}</dd>
    </div>
  );
}
