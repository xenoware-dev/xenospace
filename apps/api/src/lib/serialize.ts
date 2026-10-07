import {
  NOTIFICATION_KINDS, permissionsFor, type CurrentUser, type PublicUser, type Role,
  type UserPreferences, type PresenceState, type UserStatus,
} from '@xenospace/shared';

/**
 * Row-to-DTO mapping.
 *
 * Centralised deliberately: `toPublicUser` is the one place that decides which
 * user columns are safe to expose, so no handler can accidentally serialise a
 * password hash or TOTP secret by spreading a row into a response.
 */

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  avatar_url: string | null;
  avatar_color: string;
  job_title: string | null;
  presence: PresenceState;
  last_seen_at: string | Date | null;
  bio?: string | null;
  timezone?: string;
  phone?: string | null;
  location?: string | null;
  github_handle?: string | null;
  skills?: string[];
  weekly_hours?: number;
  preferences?: Record<string, unknown> | null;
  email_verified?: boolean;
  totp_enabled_at?: string | Date | null;
  created_at?: string | Date;
}

const iso = (v: string | Date | null | undefined): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();

/** Non-null variant, for columns the schema guarantees. */
const isoRequired = (v: string | Date | null | undefined): string => iso(v) ?? new Date(0).toISOString();

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  density: 'comfortable',
  accent: '#6366f1',
  reducedMotion: false,
  emailDigest: 'daily',
  // Every notification kind is on by default; users opt out, not in.
  notifyOn: Object.fromEntries(NOTIFICATION_KINDS.map((k) => [k, true])),
  defaultProjectId: null,
};

export function toPreferences(raw: Record<string, unknown> | null | undefined): UserPreferences {
  const stored = (raw ?? {}) as Partial<UserPreferences>;
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    // Merged rather than replaced, so a kind added in a later release defaults
    // to on instead of vanishing from a user's saved map.
    notifyOn: { ...DEFAULT_PREFERENCES.notifyOn, ...(stored.notifyOn ?? {}) },
  };
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    avatarUrl: row.avatar_url,
    avatarColor: row.avatar_color,
    jobTitle: row.job_title,
    presence: row.presence,
    lastSeenAt: iso(row.last_seen_at),
  };
}

/** Only ever used for the requester's own record. */
export function toCurrentUser(row: UserRow): CurrentUser {
  return {
    ...toPublicUser(row),
    bio: row.bio ?? null,
    timezone: row.timezone ?? 'UTC',
    phone: row.phone ?? null,
    location: row.location ?? null,
    githubHandle: row.github_handle ?? null,
    skills: row.skills ?? [],
    weeklyHours: row.weekly_hours ?? 40,
    permissions: permissionsFor(row.role),
    preferences: toPreferences(row.preferences),
    twoFactorEnabled: Boolean(row.totp_enabled_at),
    emailVerified: Boolean(row.email_verified),
    createdAt: isoRequired(row.created_at),
  };
}

/** Columns `toPublicUser` needs, aliased for joins. Keeps SELECTs honest. */
export const PUBLIC_USER_COLUMNS = `
  id, email, name, role, status, avatar_url, avatar_color, job_title, presence, last_seen_at
`;

export const CURRENT_USER_COLUMNS = `
  id, email, name, role, status, avatar_url, avatar_color, job_title, presence, last_seen_at,
  bio, timezone, phone, location, github_handle, skills, weekly_hours, preferences,
  email_verified, totp_enabled_at, created_at
`;

/**
 * Builds a nested public user from a prefixed join, e.g. `assignee_id`,
 * `assignee_name`. Returns null when the join produced no row.
 */
export function nestedUser(row: Record<string, unknown>, prefix: string): PublicUser | null {
  const id = row[`${prefix}_id`];
  if (typeof id !== 'string') return null;
  return {
    id,
    name: (row[`${prefix}_name`] as string) ?? 'Unknown',
    email: (row[`${prefix}_email`] as string) ?? '',
    role: (row[`${prefix}_role`] as Role) ?? 'DEVELOPER',
    status: (row[`${prefix}_status`] as UserStatus) ?? 'ACTIVE',
    avatarUrl: (row[`${prefix}_avatar_url`] as string | null) ?? null,
    avatarColor: (row[`${prefix}_avatar_color`] as string) ?? '#6366f1',
    jobTitle: (row[`${prefix}_job_title`] as string | null) ?? null,
    presence: (row[`${prefix}_presence`] as PresenceState) ?? 'OFFLINE',
    lastSeenAt: iso(row[`${prefix}_last_seen_at`] as string | null),
  };
}

/** SELECT fragment producing the prefixed columns `nestedUser` reads. */
export function userJoinColumns(alias: string, prefix: string): string {
  return [
    'id', 'email', 'name', 'role', 'status', 'avatar_url', 'avatar_color',
    'job_title', 'presence', 'last_seen_at',
  ]
    .map((col) => `${alias}.${col} AS ${prefix}_${col}`)
    .join(', ');
}

export { iso, isoRequired };
