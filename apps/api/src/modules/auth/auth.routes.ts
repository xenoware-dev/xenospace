import { Router, type Request } from 'express';
import {
  changePasswordSchema, forgotPasswordSchema, loginSchema, oauthCallbackSchema,
  registerSchema, resetPasswordSchema, revokeSessionSchema,
} from '@xenospace/shared';
import { z } from 'zod';
import { env, isDev } from '../../config/env.js';
import { db } from '../../db/index.js';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, invalidateAuthCache, principal } from '../../middleware/authenticate.js';
import { requireCsrfToken } from '../../middleware/csrf.js';
import { authEmailLimiter, authLimiter, clientIp, sensitiveActionLimiter } from '../../middleware/rateLimit.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { created, noContent, noStore, ok } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { auditFromRequest } from '../../middleware/audit.js';
import {
  accessTokenTtlSeconds, clearRefreshCookie, readRefreshCookie, revokeSession,
  revokeSessionByToken, rotateRefreshToken, setRefreshCookie, signAccessToken,
} from '../../auth/tokens.js';
import { createAuthUrl, exchangeCode, googleEnabled, parseState } from '../../auth/oauth/google.js';
import { pickAvatarColor } from './auth.service.js';
import { isPinnedAdmin, reconcileAdminRoles, roleForNewAccount } from '../../auth/adminPolicy.js';
import * as service from './auth.service.js';
import { CURRENT_USER_COLUMNS, toCurrentUser, type UserRow } from '../../lib/serialize.js';

export const authRouter = Router();

const meta = (req: Request) => ({ ip: clientIp(req), userAgent: req.get('user-agent') ?? null });

/* --------------------------------------------------------------------- login */

/**
 * Refuses password routes when Google is the only way in. Enforced here, not
 * just by hiding the form, so a direct request cannot get round it.
 */
const passwordRoutesEnabled: import('express').RequestHandler = (_req, res, next) => {
  if (env.PASSWORD_LOGIN) return next();
  res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'Password sign-in is turned off. Continue with Google instead.' },
  });
};

/** Self-service sign-up is closed when access is by invitation. */
const registrationEnabled: import('express').RequestHandler = (req, res, next) => {
  const hasInvite = typeof (req.body as { inviteToken?: unknown } | undefined)?.inviteToken === 'string';
  if (env.ACCESS === 'open' || hasInvite) return next();
  res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'Accounts are created by your team lead. Ask them to add your email.' },
  });
};

authRouter.post(
  '/login',
  passwordRoutesEnabled,
  authLimiter,
  authEmailLimiter,
  validate({ body: loginSchema }),
  asyncRoute(async (req, res) => {
    const input = validBody(req, loginSchema);
    const result = await service.login(input, meta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    noStore(res);
    ok(res, result.session);
  }),
);

authRouter.post(
  '/register',
  passwordRoutesEnabled,
  registrationEnabled,
  authLimiter,
  validate({ body: registerSchema }),
  asyncRoute(async (req, res) => {
    const input = validBody(req, registerSchema);
    const result = await service.register(input, meta(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    noStore(res);
    created(res, result.session);
  }),
);

/**
 * Exchanges the refresh cookie for a new access token.
 *
 * CSRF-protected because this is the one authenticated endpoint that trusts a
 * cookie rather than a bearer token, and so is the only one a cross-site form
 * post could otherwise drive.
 */
authRouter.post(
  '/refresh',
  authLimiter,
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const token = readRefreshCookie(req);
    if (!token) {
      clearRefreshCookie(res);
      noStore(res);
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } });
      return;
    }

    try {
      // Manages its own transactions; see rotateRefreshToken.
      const rotated = await rotateRefreshToken(token, {
        userAgent: req.get('user-agent') ?? null,
        ipAddress: clientIp(req),
      });
      const accessToken = await signAccessToken(rotated.userId, rotated.role, rotated.session.familyId);
      const user = await service.getCurrentUser(rotated.userId);

      setRefreshCookie(res, rotated.session.refreshToken, rotated.session.expiresAt);
      noStore(res);
      ok(res, { user, accessToken, expiresIn: accessTokenTtlSeconds() });
    } catch (err) {
      // Any refresh failure clears the cookie, so a client holding a dead token
      // stops retrying with it on every page load.
      clearRefreshCookie(res);
      throw err;
    }
  }),
);

authRouter.post(
  '/logout',
  requireCsrfToken,
  asyncRoute(async (req, res) => {
    const token = readRefreshCookie(req);
    if (token) {
      const userId = await db().transaction(async (tx) => revokeSessionByToken(tx, token));
      // Without this the access token keeps authenticating until the cache
      // entry expires — found by the session-family regression suite.
      if (userId) await invalidateAuthCache(userId);
    }
    clearRefreshCookie(res);
    auditFromRequest(req, { action: 'auth.logout', resource: 'session' });
    noContent(res);
  }),
);

/* ------------------------------------------------------------------ password */

authRouter.post(
  '/forgot-password',
  passwordRoutesEnabled,
  sensitiveActionLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncRoute(async (req, res) => {
    const { email } = validBody(req, forgotPasswordSchema);
    const result = await service.requestPasswordReset(email, meta(req));

    // Always 202, whether or not the account exists, so the response cannot be
    // used to tell registered addresses from unregistered ones.
    if (result) {
      const link = new URL(`/reset-password?token=${result.token}`, env.WEB_URL).toString();
      // No mail transport is configured yet, so the link is logged for the
      // operator. Swap this for the transport without touching the contract.
      logger.info({ userId: result.userId, link }, 'password reset link generated');
    }
    res.status(202).json({ message: 'If that account exists, a reset link is on its way.' });
  }),
);

authRouter.post(
  '/reset-password',
  passwordRoutesEnabled,
  sensitiveActionLimiter,
  validate({ body: resetPasswordSchema }),
  asyncRoute(async (req, res) => {
    const input = validBody(req, resetPasswordSchema);
    await service.resetPassword(input, meta(req));
    noContent(res);
  }),
);

authRouter.post(
  '/change-password',
  passwordRoutesEnabled,
  authenticate,
  validate({ body: changePasswordSchema }),
  asyncRoute(async (req, res) => {
    const me = principal(req);
    const input = validBody(req, changePasswordSchema);
    await service.changePassword(me.id, input, me.sessionId, meta(req));
    noContent(res);
  }),
);

/* --------------------------------------------------------------------- state */

authRouter.get(
  '/me',
  authenticate,
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.getCurrentUser(principal(req).id));
  }),
);

authRouter.get(
  '/sessions',
  authenticate,
  asyncRoute(async (req, res) => {
    const me = principal(req);
    noStore(res);
    ok(res, await service.listSessions(me.id, me.sessionId));
  }),
);

authRouter.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({ params: z.object({ sessionId: z.string().uuid() }) }),
  asyncRoute(async (req, res) => {
    const me = principal(req);
    const { sessionId } = req.params as { sessionId: string };
    // Scoped to the caller's own sessions, so one user cannot revoke another's.
    const revoked = await db().transaction(async (tx) => revokeSession(tx, sessionId, me.id));
    if (revoked) {
      await invalidateAuthCache(me.id);
      auditFromRequest(req, { action: 'auth.session_revoked', resource: 'session', resourceId: sessionId });
    }
    noContent(res);
  }),
);

authRouter.post(
  '/logout-all',
  authenticate,
  asyncRoute(async (req, res) => {
    const me = principal(req);
    const count = await db().transaction(async (tx) => {
      const { revokeAllSessions } = await import('../../auth/tokens.js');
      return revokeAllSessions(tx, me.id);
    });
    await invalidateAuthCache(me.id);
    clearRefreshCookie(res);
    auditFromRequest(req, { action: 'auth.logout_all', resource: 'session', metadata: { count } });
    ok(res, { revoked: count });
  }),
);

/* --------------------------------------------------------------------- OAuth */

authRouter.get(
  '/oauth/google',
  authLimiter,
  validate({ query: z.object({ next: z.string().max(512).optional() }) }),
  asyncRoute(async (req, res) => {
    if (!googleEnabled) {
      res.status(501).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Google sign-in is not configured.' } });
      return;
    }
    const { next } = validQuery(req, z.object({ next: z.string().max(512).optional() }));
    const { url } = createAuthUrl(next);
    res.redirect(302, url);
  }),
);

/** Thrown inside the callback to send the user back with a reason. */
class OAuthBounce extends Error {
  constructor(readonly reason: string, readonly email?: string) {
    super(reason);
  }
}

/**
 * Refusals about *who* signed in get their own page, which names the account
 * and offers to try another; transient failures go back to the login form.
 */
const ACCESS_DENIED = new Set(['not_invited', 'account_inactive']);

const bounceToLogin = (reason: string, email?: string) => {
  if (!ACCESS_DENIED.has(reason)) return new URL(`/login?error=${reason}`, env.WEB_URL).toString();
  const url = new URL('/access-denied', env.WEB_URL);
  url.searchParams.set('reason', reason);
  // The address Google just returned for this person, shown back to them so
  // they can see which account was used. It is their own, in their own browser.
  if (email) url.searchParams.set('email', email);
  return url.toString();
};

authRouter.get(
  '/oauth/google/callback',
  authLimiter,
  // Google sends `?error=access_denied` (and no code) when the user cancels on
  // the consent screen. That is a normal outcome, not a malformed request, so
  // it goes back to the login page rather than to a raw validation error.
  (req, res, next) => {
    if (typeof req.query.error === 'string') {
      res.redirect(302, bounceToLogin(req.query.error === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed'));
      return;
    }
    next();
  },
  validate({ query: oauthCallbackSchema }),
  asyncRoute(async (req, res) => {
    const { code, state } = validQuery(req, oauthCallbackSchema);
    try {
      await completeGoogleSignIn(req, res, code, state);
    } catch (err) {
      // Every failure lands the user on the login page with a reason; the
      // detail goes to the log, not to the browser.
      if (err instanceof OAuthBounce) {
        res.redirect(302, bounceToLogin(err.reason, err.email));
        return;
      }
      logger.warn({ err }, 'google sign-in failed');
      // Google answered but our side could not finish: say so, rather than
      // implying the person's Google account is the problem.
      const message = err instanceof Error ? err.message : '';
      const serverSide = /connect|timeout|ECONN|terminated|database/i.test(message);
      res.redirect(302, bounceToLogin(serverSide ? 'server_unavailable' : 'oauth_failed'));
    }
  }),
);

async function completeGoogleSignIn(
  req: Request,
  res: import('express').Response,
  code: string,
  state: string,
): Promise<void> {
    const parsed = parseState(state);
    const profile = await exchangeCode(code, parsed.verifier);

    // An unverified provider email must not be able to claim an existing
    // account, which would be a full account takeover.
    if (!profile.emailVerified) throw new OAuthBounce('email_unverified');

    const result = await db().transaction(async (tx) => {
      const { rows: linked } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM oauth_accounts WHERE provider = 'GOOGLE' AND provider_user_id = $1`,
        [profile.providerUserId],
      );

      let userId = linked[0]?.user_id ?? null;

      if (!userId) {
        const { rows: byEmail } = await tx.query<{ id: string; email_verified: boolean }>(
          `SELECT id, email_verified FROM users WHERE lower(email) = $1`,
          [profile.email],
        );
        userId = byEmail[0]?.id ?? null;

        if (userId && !byEmail[0]!.email_verified) {
          // The account was made by password sign-up, which never proved the
          // inbox — possibly by someone squatting this address. Google has now
          // proved it, so the unproven password and its sessions are dropped;
          // the owner can set a password again through reset.
          await tx.query(
            `UPDATE users SET password_hash = NULL, email_verified = true, tokens_valid_from = now() WHERE id = $1`,
            [userId],
          );
          await tx.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
        }

        if (!userId) {
          // A team lead may have added this address. Google has just proved
          // the inbox, which is all an invitation link would have proved.
          const { rows: invites } = await tx.query<{ id: string; role: 'ADMIN' | 'DEVELOPER'; name: string | null; project_ids: string[] }>(
            `SELECT id, role, name, project_ids FROM invitations
              WHERE lower(email) = $1 AND accepted_at IS NULL AND expires_at > now()`,
            [profile.email],
          );
          const invite = invites[0];

          if (!invite && env.ACCESS === 'invite_only' && !isPinnedAdmin(profile.email)) {
            throw new OAuthBounce('not_invited', profile.email);
          }

          const { rows: counts } = await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM users`);
          const policyRole = roleForNewAccount(profile.email, { isFirstUser: (counts[0]?.n ?? 0) === 0, emailVerified: true });
          // An invitation's role stands unless ADMIN_EMAILS pins the leads.
          const role = invite && env.ADMIN_EMAILS.length === 0 ? invite.role : policyRole;
          const { rows: inserted } = await tx.query<{ id: string }>(
            `INSERT INTO users (email, name, role, status, email_verified, avatar_url, avatar_color)
             VALUES ($1, $2, $3, 'ACTIVE', true, $4, $5) RETURNING id`,
            [profile.email, profile.name || invite?.name || profile.email, role, profile.picture, pickAvatarColor(profile.email)],
          );
          userId = inserted[0]!.id;

          if (invite) {
            await tx.query(`UPDATE invitations SET accepted_at = now() WHERE id = $1`, [invite.id]);
            // Only projects that still exist; one deleted since the invite is skipped.
            await tx.query(
              `INSERT INTO project_members (project_id, user_id)
               SELECT p.id, $2 FROM projects p WHERE p.id = ANY($1::uuid[])
               ON CONFLICT DO NOTHING`,
              [(invite.project_ids ?? []).slice(0, 50), userId],
            );
          }
        }

        await tx.query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email)
           VALUES ($1, 'GOOGLE', $2, $3) ON CONFLICT (provider, provider_user_id) DO NOTHING`,
          [userId, profile.providerUserId, profile.email],
        );
      }

      // A listed lead signing in with Google for the first time after an
      // earlier password account is promoted now, not at the next restart.
      await reconcileAdminRoles(tx);

      const { rows } = await tx.query<UserRow & { totp_on: boolean }>(
        `SELECT ${CURRENT_USER_COLUMNS}, (totp_enabled_at IS NOT NULL) AS totp_on FROM users WHERE id = $1`,
        [userId],
      );
      const user = rows[0];
      if (!user || user.status !== 'ACTIVE') throw new OAuthBounce('account_inactive', profile.email);
      // Google proves the Google account, not the second factor this user
      // chose. Without this, enabling two-factor would be bypassed by anyone
      // who controls the linked Google account.
      if (user.totp_on) throw new OAuthBounce('totp_required');

      const { issueSession } = await import('../../auth/tokens.js');
      const session = await issueSession(tx, user.id, {
        userAgent: req.get('user-agent') ?? null,
        ipAddress: clientIp(req),
        remember: true,
      });
      await tx.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [user.id]);
      return { user: toCurrentUser(user), session };
    });

    setRefreshCookie(res, result.session.refreshToken, result.session.expiresAt);
    auditFromRequest(req, {
      action: 'auth.oauth_login',
      resource: 'user',
      resourceId: result.user.id,
      metadata: { provider: 'GOOGLE' },
    });

    // The SPA completes sign-in by calling /refresh, so no token is placed in
    // the URL where it would land in browser history and server logs.
    res.redirect(302, new URL(`/auth/callback?next=${encodeURIComponent(parsed.next)}`, env.WEB_URL).toString());
}

authRouter.get('/providers', (_req, res) => {
  ok(res, {
    google: googleEnabled,
    password: env.PASSWORD_LOGIN,
    // Whether the login page should offer "Create an account" at all.
    registration: env.PASSWORD_LOGIN && env.ACCESS === 'open',
    // When the leads are pinned by config, the UI does not offer the role.
    leadPinned: env.ADMIN_EMAILS.length > 0,
  });
});

/* ----------------------------------------------------------------- dev only */

/**
 * Surfaces the most recent reset token locally, because no mail transport is
 * wired up. Guarded twice: the env flag is forced off in production, and this
 * block is not even registered unless NODE_ENV is development.
 */
if (isDev && env.ENABLE_DEV_ROUTES) {
  authRouter.get(
    '/dev/last-reset-token',
    asyncRoute(async (_req, res) => {
      const { rows } = await db().query(
        `SELECT user_id, created_at FROM auth_tokens
          WHERE purpose = 'PASSWORD_RESET' AND consumed_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
      );
      ok(res, { note: 'Tokens are stored hashed; use the link printed in the API logs.', latest: rows[0] ?? null });
    }),
  );
}
