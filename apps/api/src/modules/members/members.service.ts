import { ROLES, type CurrentUser, type Paginated, type PublicUser, type Role } from '@xenospace/shared';
import { db } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { paginate } from '../../lib/http.js';
import {
  CURRENT_USER_COLUMNS, PUBLIC_USER_COLUMNS, iso, toCurrentUser, toPreferences,
  toPublicUser, type UserRow,
} from '../../lib/serialize.js';
import { recordActivity, writeAudit } from '../../middleware/audit.js';
import { invalidateAuthCache } from '../../middleware/authenticate.js';
import type { Principal } from '../../middleware/authenticate.js';
import { safeOrder, safeSort, WhereBuilder } from '../common/access.js';
import { hashToken, randomToken } from '../../auth/crypto.js';
import { realtime } from '../../realtime/socket.js';
import { assertMayHoldAdmin } from '../../auth/adminPolicy.js';
import { notify } from '../notifications/notifications.service.js';
import { revokeAllSessions } from '../../auth/tokens.js';

/** Team directory, member administration and invitations. */

export interface MemberSummary extends PublicUser {
  skills: string[];
  weeklyHours: number;
  openTasks: number;
  doneTasks: number;
  openIssues: number;
  projectCount: number;
  loggedMinutesThisWeek: number;
  createdAt: string;
}

const SORT_COLUMNS = {
  name: 'u.name',
  createdAt: 'u.created_at',
  openTasks: 'open_tasks',
} as const;

export async function listMembers(
  actor: Principal,
  q: { page: number; pageSize: number; q?: string; role?: string[]; status?: string[]; projectId?: string; sort?: string; order?: string },
): Promise<Paginated<MemberSummary>> {
  const where = new WhereBuilder();
  where.addIf(q.q, `(u.name ILIKE ? OR u.email ILIKE ? OR coalesce(u.job_title, '') ILIKE ?)`, `%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
  where.addIf(q.role, `u.role = ANY(?::text[])`, q.role);
  where.addIf(q.status, `u.status = ANY(?::text[])`, q.status);
  where.addIf(q.projectId, `EXISTS (SELECT 1 FROM project_members pm WHERE pm.user_id = u.id AND pm.project_id = ?)`, q.projectId);

  /*
   * A developer sees only the people they actually work with — colleagues on a
   * shared project — rather than the whole company directory. A team lead sees
   * everyone. Deactivated accounts are hidden from developers entirely.
   */
  if (actor.role !== 'ADMIN') {
    where.add(
      `(u.id = ? OR EXISTS (
          SELECT 1 FROM project_members mine
            JOIN project_members theirs ON theirs.project_id = mine.project_id
           WHERE mine.user_id = ? AND theirs.user_id = u.id
       ))`,
      actor.id, actor.id,
    );
    where.raw(`u.status <> 'DEACTIVATED'`);
  }

  const sort = safeSort(q.sort, SORT_COLUMNS, 'name');
  const order = safeOrder(q.order);
  const offset = (q.page - 1) * q.pageSize;

  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `SELECT ${PUBLIC_USER_COLUMNS.split(',').map((c) => `u.${c.trim()}`).join(', ')},
              u.skills, u.weekly_hours, u.created_at,
              (SELECT count(*)::int FROM tasks t WHERE t.assignee_id = u.id AND t.status <> 'DONE') AS open_tasks,
              (SELECT count(*)::int FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'DONE') AS done_tasks,
              (SELECT count(*)::int FROM issues i WHERE i.assignee_id = u.id
                 AND i.status NOT IN ('RESOLVED','CLOSED','WONT_FIX')) AS open_issues,
              (SELECT count(*)::int FROM project_members pm WHERE pm.user_id = u.id) AS project_count,
              (SELECT coalesce(sum(tl.minutes),0)::int FROM time_logs tl
                 WHERE tl.user_id = u.id AND tl.spent_on >= current_date - 7) AS logged_week
         FROM users u
         ${where.sql}
         ORDER BY ${sort} ${order} NULLS LAST, u.id
         LIMIT ${q.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${where.sql}`, where.params),
  ]);

  const items = rows.map((row) => ({
    ...toPublicUser(row as unknown as UserRow),
    skills: (row.skills as string[]) ?? [],
    weeklyHours: (row.weekly_hours as number) ?? 40,
    openTasks: (row.open_tasks as number) ?? 0,
    doneTasks: (row.done_tasks as number) ?? 0,
    openIssues: (row.open_issues as number) ?? 0,
    projectCount: (row.project_count as number) ?? 0,
    loggedMinutesThisWeek: (row.logged_week as number) ?? 0,
    createdAt: iso(row.created_at as string)!,
  }));

  return paginate(items, counts[0]?.n ?? 0, q.page, q.pageSize);
}

export async function getMember(actor: Principal, id: string): Promise<MemberSummary & { projects: Array<{ id: string; name: string; key: string; color: string; projectRole: string }> }> {
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT ${PUBLIC_USER_COLUMNS.split(',').map((c) => `u.${c.trim()}`).join(', ')},
            u.skills, u.weekly_hours, u.created_at, u.bio, u.location, u.github_handle, u.timezone,
            (SELECT count(*)::int FROM tasks t WHERE t.assignee_id = u.id AND t.status <> 'DONE') AS open_tasks,
            (SELECT count(*)::int FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'DONE') AS done_tasks,
            (SELECT count(*)::int FROM issues i WHERE i.assignee_id = u.id
               AND i.status NOT IN ('RESOLVED','CLOSED','WONT_FIX')) AS open_issues,
            (SELECT count(*)::int FROM project_members pm WHERE pm.user_id = u.id) AS project_count,
            (SELECT coalesce(sum(tl.minutes),0)::int FROM time_logs tl
               WHERE tl.user_id = u.id AND tl.spent_on >= current_date - 7) AS logged_week
       FROM users u WHERE u.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('Member');

  // A developer may only view a colleague they share a project with.
  if (actor.role !== 'ADMIN' && id !== actor.id) {
    const { rows: shared } = await db().query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM project_members mine
           JOIN project_members theirs ON theirs.project_id = mine.project_id
          WHERE mine.user_id = $1 AND theirs.user_id = $2
       ) AS ok`,
      [actor.id, id],
    );
    if (!shared[0]?.ok) throw notFound('Member');
  }

  const { rows: projects } = await db().query<{ id: string; name: string; key: string; color: string; project_role: string }>(
    `SELECT p.id, p.name, p.key, p.color, pm.project_role
       FROM project_members pm JOIN projects p ON p.id = pm.project_id
      WHERE pm.user_id = $1 AND p.archived_at IS NULL ORDER BY p.name`,
    [id],
  );

  return {
    ...toPublicUser(row as unknown as UserRow),
    skills: (row.skills as string[]) ?? [],
    weeklyHours: (row.weekly_hours as number) ?? 40,
    openTasks: (row.open_tasks as number) ?? 0,
    doneTasks: (row.done_tasks as number) ?? 0,
    openIssues: (row.open_issues as number) ?? 0,
    projectCount: (row.project_count as number) ?? 0,
    loggedMinutesThisWeek: (row.logged_week as number) ?? 0,
    createdAt: iso(row.created_at as string)!,
    projects: projects.map((p) => ({ id: p.id, name: p.name, key: p.key, color: p.color, projectRole: p.project_role })),
  };
}

/**
 * Changes a member's workspace role.
 *
 * Guarded against removing the last team lead, which would leave the workspace
 * with nobody able to administer it. A role change also drops the cached auth
 * state and disconnects their sockets, so the new permissions take effect at
 * once rather than after the cache TTL.
 */
export async function updateRole(actor: Principal, userId: string, role: Role): Promise<PublicUser> {
  if (!ROLES.includes(role)) throw badRequest('Unknown role.');
  if (userId === actor.id) throw forbidden('You cannot change your own role.');

  await db().transaction(async (tx) => {
    const { rows } = await tx.query<{ role: Role; name: string; email: string }>(
      `SELECT role, name, email FROM users WHERE id = $1`,
      [userId],
    );
    const existing = rows[0];
    if (!existing) throw notFound('Member');
    if (role === 'ADMIN') assertMayHoldAdmin(existing.email);
    // Already in the target role: nothing to do, and no audit noise.
    if (existing.role === role) return;

    if (existing.role === 'ADMIN') {
      const { rows: admins } = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`,
      );
      if ((admins[0]?.n ?? 0) <= 1) throw conflict('Promote another team lead before demoting the last one.');
    }

    await tx.query(`UPDATE users SET role = $2 WHERE id = $1`, [userId, role]);
    await writeAudit(
      { actorId: actor.id, action: 'member.role_changed', resource: 'user', resourceId: userId, metadata: { from: existing.role, to: role } },
      tx,
    );
    await recordActivity(
      { actorId: actor.id, action: 'member.role_changed', entityType: 'user', entityId: userId, entityLabel: existing.name, metadata: { from: existing.role, to: role } },
      tx,
    );
  });

  await invalidateAuthCache(userId);
  // Their open sockets were authorized under the old role.
  await realtime.disconnectUser(userId, 'ROLE_CHANGED');
  await notify({
    userIds: [userId], kind: 'SYSTEM',
    title: 'Your role changed',
    body: `You are now a ${role === 'ADMIN' ? 'team lead' : 'developer'}.`,
    actorId: actor.id,
  });

  const { rows } = await db().query<UserRow>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return toPublicUser(rows[0]!);
}

export async function updateMember(actor: Principal, userId: string, input: Record<string, unknown>): Promise<PublicUser> {
  const columns: Record<string, string> = {
    name: 'name', jobTitle: 'job_title', weeklyHours: 'weekly_hours', skills: 'skills',
  };
  const sets: string[] = [];
  const params: unknown[] = [userId];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length === 0) throw badRequest('Provide at least one field to update.');

  const { rowCount } = await db().query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
  if (rowCount === 0) throw notFound('Member');

  await writeAudit({ actorId: actor.id, action: 'member.updated', resource: 'user', resourceId: userId, metadata: { fields: Object.keys(input) } });
  await invalidateAuthCache(userId);

  const { rows } = await db().query<UserRow>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return toPublicUser(rows[0]!);
}

/**
 * Suspends or reactivates an account.
 *
 * Deactivation is preferred over deletion: tasks, comments and history stay
 * attributable. Suspending also revokes every session immediately.
 */
export async function setStatus(
  actor: Principal,
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED',
): Promise<PublicUser> {
  if (userId === actor.id) throw forbidden('You cannot change your own status.');

  await db().transaction(async (tx) => {
    const { rows } = await tx.query<{ role: Role }>(`SELECT role FROM users WHERE id = $1`, [userId]);
    if (!rows[0]) throw notFound('Member');

    if (rows[0].role === 'ADMIN' && status !== 'ACTIVE') {
      const { rows: admins } = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`,
      );
      if ((admins[0]?.n ?? 0) <= 1) throw conflict('This is the last active team lead.');
    }

    await tx.query(`UPDATE users SET status = $2 WHERE id = $1`, [userId, status]);
    if (status !== 'ACTIVE') {
      await revokeAllSessions(tx, userId);
      await tx.query(`UPDATE users SET presence = 'OFFLINE' WHERE id = $1`, [userId]);
    }
    await writeAudit(
      { actorId: actor.id, action: 'member.status_changed', resource: 'user', resourceId: userId, metadata: { status } },
      tx,
    );
  });

  await invalidateAuthCache(userId);
  if (status !== 'ACTIVE') await realtime.disconnectUser(userId, 'REVOKED');

  const { rows } = await db().query<UserRow>(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return toPublicUser(rows[0]!);
}

/* -------------------------------------------------------------- invitations */

export interface InviteResult {
  id: string;
  email: string;
  role: Role;
  /** Returned once, for the operator to deliver. Only its hash is stored. */
  token: string;
  expiresAt: string;
}

export async function inviteMember(
  actor: Principal,
  input: { email: string; role: Role; name?: string; projectIds?: string[] },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  if (input.role === 'ADMIN') assertMayHoldAdmin(email);
  const token = randomToken(32);

  const result = await db().transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = $1`,
      [email],
    );
    if (existing.length) throw conflict('Someone with that email is already a member.');

    // Re-inviting replaces the outstanding invitation rather than erroring,
    // which is what the partial unique index on pending invites allows.
    await tx.query(`DELETE FROM invitations WHERE lower(email) = $1 AND accepted_at IS NULL`, [email]);

    const { rows } = await tx.query<{ id: string; expires_at: string }>(
      `INSERT INTO invitations (email, role, name, token_hash, invited_by, project_ids, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + interval '30 days')
       RETURNING id, expires_at`,
      [email, input.role, input.name ?? null, hashToken(token), actor.id, input.projectIds ?? []],
    );
    await writeAudit(
      { actorId: actor.id, action: 'member.invited', resource: 'invitation', resourceId: rows[0]!.id, metadata: { email, role: input.role } },
      tx,
    );
    return rows[0]!;
  });

  return { id: result.id, email, role: input.role, token, expiresAt: iso(result.expires_at)! };
}

export async function listInvitations(): Promise<Array<{ id: string; email: string; role: Role; name: string | null; expiresAt: string; createdAt: string; expired: boolean }>> {
  const { rows } = await db().query<{
    id: string; email: string; role: Role; name: string | null; expires_at: string; created_at: string;
  }>(
    `SELECT id, email, role, name, expires_at, created_at
       FROM invitations WHERE accepted_at IS NULL ORDER BY created_at DESC`,
  );
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    name: r.name,
    expiresAt: iso(r.expires_at)!,
    createdAt: iso(r.created_at)!,
    expired: new Date(r.expires_at).getTime() < now,
  }));
}

export async function revokeInvitation(actor: Principal, id: string): Promise<void> {
  const { rowCount } = await db().query(`DELETE FROM invitations WHERE id = $1 AND accepted_at IS NULL`, [id]);
  if (rowCount === 0) throw notFound('Invitation');
  await writeAudit({ actorId: actor.id, action: 'member.invite_revoked', resource: 'invitation', resourceId: id });
}

/* ------------------------------------------------------- profile & settings */

export async function updateProfile(userId: string, input: Record<string, unknown>): Promise<CurrentUser> {
  const columns: Record<string, string> = {
    name: 'name', jobTitle: 'job_title', bio: 'bio', timezone: 'timezone', phone: 'phone',
    location: 'location', githubHandle: 'github_handle', skills: 'skills',
    avatarColor: 'avatar_color', weeklyHours: 'weekly_hours',
  };
  const sets: string[] = [];
  const params: unknown[] = [userId];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (sets.length > 0) {
    await db().query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
    await invalidateAuthCache(userId);
  }
  const { rows } = await db().query<UserRow>(`SELECT ${CURRENT_USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) throw notFound('User');
  return toCurrentUser(rows[0]);
}

/** Merges into the stored preferences rather than replacing the whole object. */
export async function updatePreferences(userId: string, input: Record<string, unknown>): Promise<CurrentUser> {
  const { rows: current } = await db().query<{ preferences: Record<string, unknown> | null }>(
    `SELECT preferences FROM users WHERE id = $1`,
    [userId],
  );
  if (!current[0]) throw notFound('User');

  const existing = toPreferences(current[0].preferences);
  const merged = {
    ...existing,
    ...input,
    notifyOn: { ...existing.notifyOn, ...((input.notifyOn as Record<string, boolean>) ?? {}) },
  };

  await db().query(`UPDATE users SET preferences = $2 WHERE id = $1`, [userId, JSON.stringify(merged)]);
  const { rows } = await db().query<UserRow>(`SELECT ${CURRENT_USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
  return toCurrentUser(rows[0]!);
}

/** Directory for @-mention pickers, scoped the same way as the member list. */
export async function mentionableUsers(actor: Principal, q?: string): Promise<PublicUser[]> {
  const where = new WhereBuilder();
  where.raw(`u.status = 'ACTIVE'`);
  where.addIf(q, `(u.name ILIKE ? OR u.email ILIKE ?)`, `%${q}%`, `%${q}%`);
  if (actor.role !== 'ADMIN') {
    where.add(
      `(u.id = ? OR EXISTS (
         SELECT 1 FROM project_members mine
           JOIN project_members theirs ON theirs.project_id = mine.project_id
          WHERE mine.user_id = ? AND theirs.user_id = u.id))`,
      actor.id, actor.id,
    );
  }
  const { rows } = await db().query<UserRow>(
    `SELECT ${PUBLIC_USER_COLUMNS.split(',').map((c) => `u.${c.trim()}`).join(', ')}
       FROM users u ${where.sql} ORDER BY u.name LIMIT 50`,
    where.params,
  );
  return rows.map(toPublicUser);
}
