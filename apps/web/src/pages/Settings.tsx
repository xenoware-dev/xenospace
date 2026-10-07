import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  NOTIFICATION_KINDS, ROLE_LABEL, changePasswordSchema, passwordStrength,
  updatePreferencesSchema, updateProfileSchema,
  type CurrentUser, type DeviceSession,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { dateTime, relativeTime, titleCase } from '@/lib/format.js';
import { useMutate } from '@/hooks/useMutate.js';
import { useToast } from '@/components/ui/Toast.jsx';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Select, TextArea, TextInput, Toggle } from '@/components/ui/Field.jsx';
import { Tabs } from '@/components/ui/Tabs.jsx';
import { ConfirmDialog } from '@/components/ui/Modal.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';
import { Logout, Moon, Shield, Sun, Trash } from '@/components/icons.jsx';

/**
 * Settings.
 *
 * Four sections: profile, appearance, notifications and security. Security is
 * last and visually distinct, because it holds the destructive actions —
 * password change and session revocation.
 */
export function SettingsPage() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState('profile');

  if (!user) return <LoadingState />;

  return (
    <Page
      title="Settings"
      description="Your profile, how the app looks, and your account security."
      toolbar={
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'profile', label: 'Profile' },
            { id: 'appearance', label: 'Appearance' },
            { id: 'notifications', label: 'Notifications' },
            { id: 'security', label: 'Security' },
          ]}
        />
      }
    >
      <div className="mx-auto w-full max-w-3xl">
        {tab === 'profile' && <ProfileSection user={user} isAdmin={isAdmin} />}
        {tab === 'appearance' && <AppearanceSection user={user} />}
        {tab === 'notifications' && <NotificationsSection user={user} />}
        {tab === 'security' && <SecuritySection />}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ profile */

function ProfileSection({ user, isAdmin }: { user: CurrentUser; isAdmin: boolean }) {
  const { setUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [location, setLocation] = useState(user.location ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [githubHandle, setGithubHandle] = useState(user.githubHandle ?? '');
  const [timezone, setTimezone] = useState(user.timezone);
  const [weeklyHours, setWeeklyHours] = useState(String(user.weeklyHours));
  const [skillInput, setSkillInput] = useState('');
  const [skills, setSkills] = useState<string[]>(user.skills);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutate((input: unknown) => api.patch<CurrentUser>('/members/me', input), {
    invalidates: [keys.me, ['members']],
    successMessage: 'Profile updated',
    onSuccess: (updated) => setUser(updated),
  });

  const addSkill = () => {
    const value = skillInput.trim().slice(0, 32);
    if (value && !skills.includes(value) && skills.length < 40) setSkills([...skills, value]);
    setSkillInput('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = updateProfileSchema.safeParse({
      name, jobTitle, bio, location, phone, githubHandle, timezone, skills,
      weeklyHours: Number(weeklyHours),
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
    save.mutate(parsed.data);
  };

  // A reasonable subset; the field accepts any IANA name the server allows.
  const TIMEZONES = [
    'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Lisbon', 'America/New_York',
    'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Africa/Lagos',
    'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Card>
        <div className="flex items-center gap-4">
          <Avatar user={user} size="xl" showPresence />
          <div className="min-w-0">
            <p className="text-md font-semibold">{user.name}</p>
            <p className="text-xs text-[var(--ink-muted)]">{user.email}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Badge tone={isAdmin ? 'accent' : 'neutral'}>{ROLE_LABEL[user.role]}</Badge>
              {user.emailVerified ? (
                <Badge tone="good" size="sm" dot>Verified</Badge>
              ) : (
                <Badge tone="warning" size="sm" dot>Unverified</Badge>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 border-t border-[var(--line-subtle)] pt-3 text-2xs text-[var(--ink-faint)]">
          Your email and role are set by your team lead and cannot be changed here.
        </p>
      </Card>

      <Card>
        <CardHeader title="About you" subtitle="Shown to your team on the members page." />
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
            <TextInput label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} error={errors.jobTitle} placeholder="Senior Engineer" />
          </div>

          <TextArea
            label="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            error={errors.bio}
            rows={3}
            placeholder="What do you work on?"
            aside={`${bio.length}/1000`}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lisbon, PT" />
            <TextInput label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput
              label="GitHub"
              value={githubHandle}
              onChange={(e) => setGithubHandle(e.target.value)}
              placeholder="octocat"
              icon={<span className="text-2xs">@</span>}
            />
            <Select label="Timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>
              ))}
            </Select>
            <TextInput
              label="Weekly hours"
              type="number"
              min={0}
              max={80}
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              error={errors.weeklyHours}
              hint="Used for capacity"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--ink-secondary)]">Skills</span>
            {skills.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <li key={skill}>
                    <button
                      type="button"
                      onClick={() => setSkills(skills.filter((s) => s !== skill))}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--surface-3)] px-2 py-0.5 text-2xs transition-colors hover:bg-[var(--status-critical-wash)] hover:text-[var(--status-critical-ink)]"
                    >
                      {skill}
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addSkill();
                }
              }}
              onBlur={addSkill}
              placeholder="Add a skill and press Enter"
              aria-label="Add a skill"
              className="h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 text-sm ring-1 ring-inset ring-[var(--line)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end border-t border-[var(--line-subtle)] pt-4">
          <Button type="submit" variant="primary" loading={save.isPending}>Save profile</Button>
        </div>
      </Card>
    </form>
  );
}

/* --------------------------------------------------------------- appearance */

function AppearanceSection({ user }: { user: CurrentUser }) {
  const { setUser } = useAuth();
  const { theme, setTheme, density, setDensity } = useTheme();

  const save = useMutate((input: unknown) => api.patch<CurrentUser>('/members/me/preferences', input), {
    invalidates: [keys.me],
    onSuccess: (updated) => setUser(updated),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Theme" subtitle="Dark is the default; both are designed, not inverted." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              { value: 'dark' as const, label: 'Dark', icon: <Moon size={14} />, hint: 'Easier for long sessions' },
              { value: 'light' as const, label: 'Light', icon: <Sun size={14} />, hint: 'Better in bright rooms' },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={theme === option.value}
              onClick={() => {
                setTheme(option.value);
                save.mutate(updatePreferencesSchema.parse({ theme: option.value }));
              }}
              className={cn(
                'flex items-start gap-3 rounded-[var(--radius-md)] p-3 text-left ring-1 ring-inset transition-colors',
                theme === option.value
                  ? 'bg-[var(--accent-wash)] ring-[var(--accent)]'
                  : 'bg-[var(--surface-inset)] ring-[var(--line-subtle)] hover:ring-[var(--line)]',
              )}
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)]',
                  theme === option.value ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'bg-[var(--surface-3)] text-[var(--ink-muted)]',
                )}
              >
                {option.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium">{option.label}</span>
                <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Density" subtitle="How much vertical space list rows take." />
        <div className="mt-4 flex flex-col gap-3">
          <Toggle
            label="Compact rows"
            hint="Fits more on screen. Useful on a large display."
            checked={density === 'compact'}
            onChange={(next) => {
              setDensity(next ? 'compact' : 'comfortable');
              save.mutate(updatePreferencesSchema.parse({ density: next ? 'compact' : 'comfortable' }));
            }}
          />
          <Toggle
            label="Reduce motion"
            hint="Removes transitions and animation. Your system setting is respected regardless."
            checked={user.preferences.reducedMotion}
            onChange={(next) => save.mutate(updatePreferencesSchema.parse({ reducedMotion: next }))}
          />
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ notifications */

function NotificationsSection({ user }: { user: CurrentUser }) {
  const { setUser } = useAuth();

  const save = useMutate((input: unknown) => api.patch<CurrentUser>('/members/me/preferences', input), {
    invalidates: [keys.me],
    onSuccess: (updated) => setUser(updated),
  });

  // Grouped so the list reads as topics rather than twelve equal switches.
  const GROUPS: Array<{ title: string; kinds: Array<(typeof NOTIFICATION_KINDS)[number]> }> = [
    { title: 'Your work', kinds: ['TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMMENT', 'ISSUE_ASSIGNED'] },
    { title: 'Mentions and chat', kinds: ['MENTION', 'CHANNEL_MESSAGE'] },
    { title: 'Code review', kinds: ['REVIEW_REQUESTED', 'REVIEW_APPROVED', 'REVIEW_CHANGES'] },
    { title: 'Delivery', kinds: ['SPRINT_STARTED', 'SPRINT_COMPLETED', 'DEPLOY_STATUS', 'EVENT_REMINDER'] },
    { title: 'Other', kinds: ['SYSTEM'] },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Email digest" subtitle="A summary of what you missed." />
        <div className="mt-4">
          <Select
            label="Frequency"
            value={user.preferences.emailDigest}
            onChange={(event) =>
              save.mutate(updatePreferencesSchema.parse({ emailDigest: event.target.value as 'off' | 'daily' | 'weekly' }))
            }
          >
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </Select>
        </div>
      </Card>

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader title={group.title} />
          <div className="mt-4 flex flex-col gap-3">
            {group.kinds.map((kind) => (
              <Toggle
                key={kind}
                label={titleCase(kind)}
                checked={user.preferences.notifyOn[kind] !== false}
                onChange={(next) =>
                  save.mutate(
                    updatePreferencesSchema.parse({ notifyOn: { [kind]: next } }),
                  )
                }
              />
            ))}
          </div>
        </Card>
      ))}

      <p className="text-2xs leading-relaxed text-[var(--ink-faint)]">
        Turning a type off stops both the in-app notification and the email. You will still see the
        change in the activity feed.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- security */

function SecuritySection() {
  const { logout } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const strength = passwordStrength(password);

  const { data: sessions, refetch } = useQuery({
    queryKey: keys.sessions,
    queryFn: () => api.get<DeviceSession[]>('/auth/sessions'),
  });

  const change = useMutate((input: unknown) => api.post('/auth/change-password', input), {
    errorMessage: 'Could not change your password',
    onSuccess: () => {
      setCurrentPassword(''); setPassword(''); setConfirmPassword(''); setErrors({});
      toast.success('Password changed', 'Your other devices have been signed out.');
      // The access token is invalidated server-side, so a reload re-authenticates.
      void refetch();
    },
  });

  const revokeOne = useMutate((id: string) => api.delete(`/auth/sessions/${id}`), {
    invalidates: [keys.sessions],
    successMessage: 'Session revoked',
  });

  const revokeAll = useMutate(() => api.post<{ revoked: number }>('/auth/logout-all'), {
    successMessage: 'All sessions signed out',
    onSuccess: () => void logout(),
  });

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = changePasswordSchema.safeParse({ currentPassword, password, confirmPassword });
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
    change.mutate(parsed.data);
  };

  const METER = ['var(--status-critical)', 'var(--status-critical)', 'var(--status-warning)', 'var(--status-serious)', 'var(--status-good)'];

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title={<span className="flex items-center gap-2"><Shield size={15} /> Change password</span>}
          subtitle="Changing it signs out every other device."
        />
        <form onSubmit={submitPassword} className="mt-4 flex flex-col gap-4" noValidate>
          <TextInput
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            error={errors.currentPassword}
          />

          <div>
            <TextInput
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            {password.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cn('h-1 flex-1 rounded-full', index < strength.score ? '' : 'bg-[var(--surface-3)]')}
                    style={index < strength.score ? { background: METER[strength.score] } : undefined}
                  />
                ))}
              </div>
            )}
          </div>

          <TextInput
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
          />

          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={change.isPending}>Change password</Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Active sessions"
          subtitle="Devices currently signed in to your account."
          action={
            (sessions?.length ?? 0) > 1 && (
              <Button variant="ghost" size="sm" icon={<Logout size={13} />} onClick={() => setRevokeAllOpen(true)}>
                Sign out everywhere
              </Button>
            )
          }
        />
        {!sessions ? (
          <LoadingState />
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5',
                  session.current
                    ? 'bg-[var(--accent-wash)] ring-1 ring-inset ring-[var(--accent)]/30'
                    : 'bg-[var(--surface-inset)]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate-line text-xs font-medium">
                      {describeDevice(session.userAgent)}
                    </span>
                    {session.current && <Badge tone="accent" size="sm">This device</Badge>}
                  </span>
                  <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
                    {session.ipAddress ?? 'unknown address'} · active {relativeTime(session.lastUsedAt)} ·
                    expires {dateTime(session.expiresAt)}
                  </span>
                </span>
                {!session.current && (
                  <IconButton
                    label="Revoke this session"
                    size="sm"
                    loading={revokeOne.isPending}
                    onClick={() => revokeOne.mutate(session.id)}
                  >
                    <Trash size={13} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-[var(--line-subtle)] pt-3 text-2xs leading-relaxed text-[var(--ink-faint)]">
          Sessions use rotating refresh tokens. If one is ever replayed, every session on your
          account is revoked automatically and you will be asked to sign in again.
        </p>
      </Card>

      <ConfirmDialog
        open={revokeAllOpen}
        onClose={() => setRevokeAllOpen(false)}
        onConfirm={() => revokeAll.mutate(undefined as never)}
        title="Sign out everywhere?"
        message="Every device including this one is signed out. You will need to sign in again."
        confirmLabel="Sign out everywhere"
        loading={revokeAll.isPending}
      />
    </div>
  );
}

/** A readable device name from the user agent, for the session list. */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Safari\//.test(userAgent) && !/Chrome/.test(userAgent)
        ? 'Safari'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
}
