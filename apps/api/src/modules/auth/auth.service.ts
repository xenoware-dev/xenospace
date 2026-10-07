import {
  ERROR_CODES, type AuthSession, type CurrentUser, type DeviceSession, type Role,
} from '@xenospace/shared';
import { env } from '../../config/env.js';
import { db, type Queryable } from '../../db/index.js';
import { AppError, conflict, notFound, unauthenticated } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { CURRENT_USER_COLUMNS, toCurrentUser, type UserRow } from '../../lib/serialize.js';
import {
  accessTokenTtlSeconds, issueSession, revokeAllSessions, signAccessToken,
} from '../../auth/tokens.js';
import { hashPassword, hashPassword as hash, needsRehash, verifyPassword, wasteVerificationTime } from '../../auth/password.js';
import { hashToken, randomToken } from '../../auth/crypto.js';
import { verifyTotp } from '../../auth/totp.js';
import { invalidateAuthCache } from '../../middleware/authenticate.js';
import { writeAudit } from '../../middleware/audit.js';
import { assertMaySelfRegister, roleForNewAccount } from '../../auth/adminPolicy.js';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

interface CredentialRow extends UserRow {
  password_hash: string | null;
  totp_secret: string | null;
  failed_logins: number;
  locked_until: string | null;
}

/** Records every attempt, which is what the lockout and audit views read. */
async function recordAttempt(
  tx: Queryable,
  email: string,
  meta: RequestMeta,
  successful: boolean,
  reason?: string,
): Promise<void> {
  await tx.query(
    `INSERT INTO login_attempts (email, ip_address, successful, reason, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [email, meta.ip, successful, reason ?? null, meta.userAgent?.slice(0, 500) ?? null],
  );
}

/**
 * Builds the session payload returned on any successful authentication.
 * Always reloads the user, so the response reflects committed state.
 */
async function buildSession(
  tx: Queryable,
  userId: string,
  role: Role,
  meta: RequestMeta,
  remember: boolean,
): Promise<{ session: AuthSession; refreshToken: string; refreshExpiresAt: Date; sessionId: string }> {
  const issued = await issueSession(tx, userId, {
    userAgent: meta.userAgent,
    ipAddress: meta.ip,
    remember,
  });
  const accessToken = await signAccessToken(userId, role, issued.familyId);

  const { rows } = await tx.query<UserRow>(
    `SELECT ${CURRENT_USER_COLUMNS} FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw notFound('User');

  return {
    session: { user: toCurrentUser(row), accessToken, expiresIn: accessTokenTtlSeconds() },
    refreshToken: issued.refreshToken,
    refreshExpiresAt: issued.expiresAt,
    sessionId: issued.sessionId,
  };
}

/* --------------------------------------------------------------------- login */

export interface LoginResult {
  session: AuthSession;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Password login.
 *
 * Four things are deliberate here:
 *  1. An unknown email still pays the cost of an Argon2 verification, so
 *     response timing does not reveal which accounts exist.
 *  2. Every failure returns the same CREDENTIALS_INVALID code, so the response
 *     body does not either.
 *  3. Lockout is per-account and time-boxed, which blunts credential stuffing
 *     without handing an attacker a way to lock a colleague out permanently.
 *  4. Failure bookkeeping is committed *outside* any transaction, and only the
 *     success path is transactional. Incrementing the counter inside a
 *     transaction that then throws would roll the increment back, so the
 *     lockout would never trigger and no failed attempt would ever be recorded.
 */
export async function login(
  input: { email: string; password: string; rememberMe?: boolean; totp?: string },
  meta: RequestMeta,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();

  const { rows } = await db().query<CredentialRow>(
    `SELECT ${CURRENT_USER_COLUMNS}, password_hash, totp_secret, failed_logins, locked_until
       FROM users WHERE lower(email) = $1`,
    [email],
  );
  const user = rows[0];

  /** Commits the failure trail, then raises. Never called inside a transaction. */
  const fail = async (reason: string, error: AppError, userId?: string, extra?: Record<string, unknown>): Promise<never> => {
    await recordAttempt(db(), email, meta, false, reason);
    await writeAudit({
      actorId: userId ?? null,
      action: 'auth.login',
      outcome: reason === 'LOCKED' ? 'DENIED' : 'FAILURE',
      resource: 'user',
      resourceId: userId ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { email, reason, ...(extra ?? {}) },
    });
    throw error;
  };

  if (!user || !user.password_hash) {
    // Equalise timing against the real verification path below.
    await wasteVerificationTime(input.password);
    return fail(user ? 'NO_PASSWORD' : 'NO_SUCH_USER', unauthenticated(ERROR_CODES.CREDENTIALS_INVALID), user?.id);
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return fail('LOCKED', new AppError(423, ERROR_CODES.ACCOUNT_LOCKED), user.id);
  }

  const passwordOk = await verifyPassword(user.password_hash, input.password);

  if (!passwordOk) {
    const attempts = user.failed_logins + 1;
    const shouldLock = attempts >= env.LOGIN_MAX_ATTEMPTS;
    await db().query(
      `UPDATE users
          SET failed_logins = $2,
              locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END
        WHERE id = $1`,
      [user.id, attempts, shouldLock, String(env.LOGIN_LOCKOUT_MINUTES)],
    );
    if (shouldLock) {
      logger.warn({ userId: user.id, attempts }, 'account locked after repeated failures');
      return fail('BAD_PASSWORD', new AppError(423, ERROR_CODES.ACCOUNT_LOCKED), user.id, { attempts, locked: true });
    }
    return fail('BAD_PASSWORD', unauthenticated(ERROR_CODES.CREDENTIALS_INVALID), user.id, { attempts });
  }

  // Password is correct; everything below is a second-factor or state check.
  if (user.status !== 'ACTIVE') {
    return fail(`STATUS_${user.status}`, unauthenticated(ERROR_CODES.ACCOUNT_INACTIVE), user.id);
  }

  if (user.totp_enabled_at) {
    if (!input.totp) {
      // A distinct code is unavoidable here: the client must know to prompt for
      // a code. It only reveals 2FA state to someone already holding valid
      // credentials, and is not recorded as a failed attempt.
      throw unauthenticated(ERROR_CODES.TOTP_REQUIRED);
    }
    if (!verifyTotp(user.totp_secret, input.totp)) {
      return fail('BAD_TOTP', unauthenticated(ERROR_CODES.TOTP_INVALID), user.id);
    }
  }

  // Opportunistic upgrade when policy has outgrown the stored parameters.
  const rehash = needsRehash(user.password_hash) ? await hash(input.password) : null;

  return db().transaction(async (tx) => {
    await tx.query(
      `UPDATE users
          SET failed_logins = 0, locked_until = NULL, last_seen_at = now(),
              password_hash = COALESCE($2, password_hash)
        WHERE id = $1`,
      [user.id, rehash],
    );
    await recordAttempt(tx, email, meta, true);

    const result = await buildSession(tx, user.id, user.role, meta, input.rememberMe ?? false);
    await writeAudit(
      {
        actorId: user.id, action: 'auth.login', outcome: 'SUCCESS', resource: 'user',
        resourceId: user.id, ip: meta.ip, userAgent: meta.userAgent,
        metadata: { sessionId: result.sessionId, rehashed: Boolean(rehash) },
      },
      tx,
    );

    return { session: result.session, refreshToken: result.refreshToken, refreshExpiresAt: result.refreshExpiresAt };
  });
}

/* -------------------------------------------------------------- registration */

/**
 * Self-service registration.
 *
 * The role is decided by the server, never by the request body: see
 * `adminPolicy` for who may lead. Everyone else is a DEVELOPER unless an
 * invitation says otherwise, which is what stops privilege escalation at signup.
 */
export async function register(
  input: { name: string; email: string; password: string; inviteToken?: string },
  meta: RequestMeta,
): Promise<LoginResult> {
  const email = input.email.trim().toLowerCase();
  // An invitation link proves the inbox; a bare sign-up does not.
  if (!input.inviteToken) assertMaySelfRegister(email);
  const passwordHash = await hashPassword(input.password);

  return db().transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = $1`,
      [email],
    );
    if (existing.length > 0) throw conflict(undefined, ERROR_CODES.EMAIL_TAKEN);

    let role: Role = 'DEVELOPER';
    let status = 'ACTIVE';
    let projectIds: string[] = [];
    let invitationId: string | null = null;

    if (input.inviteToken) {
      const { rows: invites } = await tx.query<{
        id: string; email: string; role: Role; project_ids: string[];
      }>(
        `SELECT id, email, role, project_ids FROM invitations
          WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()`,
        [hashToken(input.inviteToken)],
      );
      const invite = invites[0];
      // The invited address is authoritative: accepting with a different email
      // would let an invite for a developer be redeemed by anyone.
      if (!invite || invite.email.toLowerCase() !== email) {
        throw new AppError(400, ERROR_CODES.INVITE_INVALID);
      }
      // The invite link proves the inbox, so the address is verified here.
      role = env.ADMIN_EMAILS.length > 0 ? roleForNewAccount(email, { isFirstUser: false, emailVerified: true }) : invite.role;
      projectIds = invite.project_ids ?? [];
      invitationId = invite.id;
    } else {
      const { rows: counts } = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
      const isFirstUser = (counts[0]?.n ?? 0) === 0;
      role = roleForNewAccount(email, { isFirstUser, emailVerified: false });
      if (role === 'ADMIN') logger.info({ email }, 'bootstrapping first account as team lead');
    }

    const { rows: inserted } = await tx.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, role, status, email_verified, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [email, input.name.trim(), passwordHash, role, status, Boolean(invitationId), pickAvatarColor(email)],
    );
    const userId = inserted[0]?.id;
    if (!userId) throw new Error('Failed to create user');

    if (invitationId) {
      await tx.query(`UPDATE invitations SET accepted_at = now() WHERE id = $1`, [invitationId]);
      for (const projectId of projectIds.slice(0, 50)) {
        await tx.query(
          `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
          [projectId, userId],
        );
      }
    }

    await recordAttempt(tx, email, meta, true, 'REGISTERED');
    const result = await buildSession(tx, userId, role, meta, false);
    await writeAudit(
      { actorId: userId, action: 'auth.register', outcome: 'SUCCESS', resource: 'user', resourceId: userId, ip: meta.ip, userAgent: meta.userAgent, metadata: { role, viaInvite: Boolean(invitationId) } },
      tx,
    );

    return { session: result.session, refreshToken: result.refreshToken, refreshExpiresAt: result.refreshExpiresAt };
  });
}

/** Stable per-user accent, so avatars are consistent without storing an image. */
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];
export function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 2 ** 31;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

/* ------------------------------------------------------------------ password */

export async function changePassword(
  userId: string,
  input: { currentPassword: string; password: string },
  currentSessionId: string,
  meta: RequestMeta,
): Promise<void> {
  const newHash = await hashPassword(input.password);

  // Verified before opening a transaction: an audit row written inside one and
  // followed by a throw would be rolled back with it, losing the record of a
  // failed change attempt.
  const { rows: current } = await db().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE id = $1`,
    [userId],
  );
  const stored = current[0]?.password_hash;
  if (!stored || !(await verifyPassword(stored, input.currentPassword))) {
    await writeAudit({
      actorId: userId, action: 'auth.password_change', outcome: 'FAILURE',
      resource: 'user', resourceId: userId, ip: meta.ip, userAgent: meta.userAgent,
    });
    throw unauthenticated(ERROR_CODES.CREDENTIALS_INVALID, 'Your current password is incorrect.');
  }

  await db().transaction(async (tx) => {

    // Bumping tokens_valid_from invalidates outstanding access tokens, and
    // revoking the other sessions kicks out anyone using a stolen password.
    await tx.query(
      `UPDATE users SET password_hash = $2, tokens_valid_from = now() WHERE id = $1`,
      [userId, newHash],
    );
    const revoked = await revokeAllSessions(tx, userId, currentSessionId);
    await writeAudit(
      { actorId: userId, action: 'auth.password_change', outcome: 'SUCCESS', resource: 'user', resourceId: userId, ip: meta.ip, userAgent: meta.userAgent, metadata: { sessionsRevoked: revoked } },
      tx,
    );
  });

  await invalidateAuthCache(userId);
}

/**
 * Begins a password reset.
 *
 * Always resolves, whether or not the address exists — an error or a different
 * response time would turn this endpoint into an account enumerator. The token
 * is returned to the caller so the route can hand it to the mail transport;
 * only its hash is stored.
 */
export async function requestPasswordReset(
  email: string,
  meta: RequestMeta,
): Promise<{ token: string; userId: string; name: string } | null> {
  const normalised = email.trim().toLowerCase();
  const { rows } = await db().query<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM users WHERE lower(email) = $1`,
    [normalised],
  );
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE') {
    logger.info({ email: normalised }, 'password reset requested for unknown or inactive account');
    return null;
  }

  const token = randomToken(32);
  await db().transaction(async (tx) => {
    // Supersede outstanding tokens so only the newest link works.
    await tx.query(
      `UPDATE auth_tokens SET consumed_at = now()
        WHERE user_id = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL`,
      [user.id],
    );
    await tx.query(
      `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'PASSWORD_RESET', $2, now() + interval '1 hour')`,
      [user.id, hashToken(token)],
    );
    await writeAudit(
      { actorId: user.id, action: 'auth.password_reset_requested', outcome: 'SUCCESS', resource: 'user', resourceId: user.id, ip: meta.ip, userAgent: meta.userAgent },
      tx,
    );
  });

  return { token, userId: user.id, name: user.name };
}

export async function resetPassword(
  input: { token: string; password: string },
  meta: RequestMeta,
): Promise<void> {
  const newHash = await hashPassword(input.password);

  const userId = await db().transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth_tokens
        WHERE token_hash = $1 AND purpose = 'PASSWORD_RESET'
          AND consumed_at IS NULL AND expires_at > now()
        FOR UPDATE`,
      [hashToken(input.token)],
    );
    const record = rows[0];
    if (!record) throw new AppError(400, ERROR_CODES.INVITE_INVALID, 'This reset link is invalid or has expired.');

    await tx.query(`UPDATE auth_tokens SET consumed_at = now() WHERE id = $1`, [record.id]);
    await tx.query(
      `UPDATE users
          SET password_hash = $2, tokens_valid_from = now(),
              failed_logins = 0, locked_until = NULL
        WHERE id = $1`,
      [record.user_id, newHash],
    );
    // A reset is the response to a possible compromise, so every session goes.
    const revoked = await revokeAllSessions(tx, record.user_id);
    await writeAudit(
      { actorId: record.user_id, action: 'auth.password_reset', outcome: 'SUCCESS', resource: 'user', resourceId: record.user_id, ip: meta.ip, userAgent: meta.userAgent, metadata: { sessionsRevoked: revoked } },
      tx,
    );
    return record.user_id;
  });

  await invalidateAuthCache(userId);
}

/* ------------------------------------------------------------------ sessions */

export async function listSessions(userId: string, currentSessionId: string): Promise<DeviceSession[]> {
  const { rows } = await db().query<{
    id: string; user_agent: string | null; ip_address: string | null;
    created_at: string; last_used_at: string; expires_at: string;
  }>(
    // One live row per family; its family id is what the client revokes by.
    `SELECT family_id AS id, user_agent, ip_address, created_at, last_used_at, expires_at
       FROM sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_used_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    userAgent: r.user_agent,
    ipAddress: r.ip_address,
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: new Date(r.last_used_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    current: r.id === currentSessionId,
  }));
}

export async function getCurrentUser(userId: string): Promise<CurrentUser> {
  const { rows } = await db().query<UserRow>(
    `SELECT ${CURRENT_USER_COLUMNS} FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw notFound('User');
  return toCurrentUser(row);
}
