import { Router } from 'express';
import { z } from 'zod';
import {
  ROLES, inviteSchema, memberListQuery, updateMemberSchema, updatePreferencesSchema,
  updateProfileSchema,
} from '@xenospace/shared';
import { env, isDev } from '../../config/env.js';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { sensitiveActionLimiter, writeLimiter } from '../../middleware/rateLimit.js';
import { auditFromRequest } from '../../middleware/audit.js';
import { created, noContent, noStore, ok } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import * as service from './members.service.js';

export const membersRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

membersRouter.use(authenticate);

/* ---------------------------------------------------------------- own profile */
// Mounted before `/:id` so "me" is never parsed as a uuid.

membersRouter.patch(
  '/me',
  writeLimiter,
  requirePermission('settings:update_own'),
  validate({ body: updateProfileSchema }),
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.updateProfile(principal(req).id, validBody(req, updateProfileSchema)));
  }),
);

membersRouter.patch(
  '/me/preferences',
  writeLimiter,
  requirePermission('settings:update_own'),
  validate({ body: updatePreferencesSchema }),
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.updatePreferences(principal(req).id, validBody(req, updatePreferencesSchema)));
  }),
);

membersRouter.get(
  '/mentionable',
  requirePermission('member:read'),
  validate({ query: z.object({ q: z.string().trim().max(80).optional() }) }),
  asyncRoute(async (req, res) => {
    const { q } = validQuery(req, z.object({ q: z.string().trim().max(80).optional() }));
    ok(res, await service.mentionableUsers(principal(req), q));
  }),
);

/* ------------------------------------------------------------- invitations */

membersRouter.get(
  '/invitations',
  requirePermission('member:invite'),
  asyncRoute(async (_req, res) => {
    noStore(res);
    ok(res, await service.listInvitations());
  }),
);

membersRouter.post(
  '/invitations',
  sensitiveActionLimiter,
  requirePermission('member:invite'),
  validate({ body: inviteSchema }),
  asyncRoute(async (req, res) => {
    const invite = await service.inviteMember(principal(req), validBody(req, inviteSchema));
    auditFromRequest(req, { action: 'member.invite', resource: 'invitation', resourceId: invite.id });

    const link = new URL(`/accept-invite?token=${invite.token}`, env.WEB_URL).toString();
    // No mail transport is configured yet; the operator delivers the link.
    logger.info({ email: invite.email, link }, 'invitation created');

    created(res, {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      // Surfaced in development so the flow is testable without email.
      // The link leads to password sign-up, so it means nothing when Google is
      // the only way in: the invitee just signs in with this address.
      ...(isDev && env.PASSWORD_LOGIN ? { inviteLink: link } : {}),
    });
  }),
);

membersRouter.delete(
  '/invitations/:id',
  requirePermission('member:invite'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    await service.revokeInvitation(principal(req), (req.params as { id: string }).id);
    noContent(res);
  }),
);

/* ---------------------------------------------------------------- directory */

membersRouter.get(
  '/',
  requirePermission('member:read'),
  validate({ query: memberListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listMembers(principal(req), validQuery(req, memberListQuery)));
  }),
);

membersRouter.get(
  '/:id',
  requirePermission('member:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getMember(principal(req), (req.params as { id: string }).id));
  }),
);

membersRouter.patch(
  '/:id',
  writeLimiter,
  requirePermission('member:update'),
  validate({ params: idParam, body: updateMemberSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    auditFromRequest(req, { action: 'member.update', resource: 'user', resourceId: id });
    ok(res, await service.updateMember(principal(req), id, validBody(req, updateMemberSchema)));
  }),
);

membersRouter.put(
  '/:id/role',
  writeLimiter,
  requirePermission('member:update_role'),
  validate({ params: idParam, body: z.object({ role: z.enum(ROLES) }) }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const { role } = validBody(req, z.object({ role: z.enum(ROLES) }));
    ok(res, await service.updateRole(principal(req), id, role));
  }),
);

membersRouter.put(
  '/:id/status',
  writeLimiter,
  requirePermission('member:deactivate'),
  validate({
    params: idParam,
    body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']) }),
  }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const { status } = validBody(req, z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']) }));
    ok(res, await service.setStatus(principal(req), id, status));
  }),
);
