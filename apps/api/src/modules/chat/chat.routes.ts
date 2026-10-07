import { Router } from 'express';
import { z } from 'zod';
import {
  createChannelSchema, editMessageSchema, messageListQuery, reactionSchema, sendMessageSchema,
} from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { rateLimit, writeLimiter, clientIp } from '../../middleware/rateLimit.js';
import { created, noContent, noStore, ok } from '../../lib/http.js';
import * as service from './chat.service.js';

export const chatRouter = Router();
const channelParam = z.object({ channelId: z.string().uuid() });
const messageParam = z.object({ channelId: z.string().uuid(), messageId: z.string().uuid() });

/** Chat is chattier than the rest of the API, so it gets its own budget. */
const messageLimiter = rateLimit({
  bucket: 'chat-send',
  windowSeconds: 60,
  max: 60,
  keyFor: (req) => req.user?.id ?? clientIp(req),
  message: 'You are sending messages too quickly.',
});

chatRouter.use(authenticate, requirePermission('chat:read'));

chatRouter.get(
  '/channels',
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.listChannels(principal(req)));
  }),
);

chatRouter.post(
  '/channels',
  writeLimiter,
  requirePermission('chat:channel_create'),
  validate({ body: createChannelSchema }),
  asyncRoute(async (req, res) => {
    created(res, await service.createChannel(principal(req), validBody(req, createChannelSchema)));
  }),
);

chatRouter.post(
  '/channels/direct',
  writeLimiter,
  validate({ body: z.object({ userId: z.string().uuid() }) }),
  asyncRoute(async (req, res) => {
    const { userId } = validBody(req, z.object({ userId: z.string().uuid() }));
    ok(res, await service.openDirectChannel(principal(req), userId));
  }),
);

chatRouter.post(
  '/channels/:channelId/join',
  writeLimiter,
  validate({ params: channelParam }),
  asyncRoute(async (req, res) => {
    await service.joinChannel(principal(req), (req.params as { channelId: string }).channelId);
    noContent(res);
  }),
);

chatRouter.post(
  '/channels/:channelId/leave',
  writeLimiter,
  validate({ params: channelParam }),
  asyncRoute(async (req, res) => {
    await service.leaveChannel(principal(req), (req.params as { channelId: string }).channelId);
    noContent(res);
  }),
);

chatRouter.post(
  '/channels/:channelId/members',
  writeLimiter,
  requirePermission('chat:channel_manage'),
  validate({ params: channelParam, body: z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }) }),
  asyncRoute(async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const { userIds } = validBody(req, z.object({ userIds: z.array(z.string().uuid()).min(1).max(100) }));
    await service.addMembers(principal(req), channelId, userIds);
    noContent(res);
  }),
);

chatRouter.get(
  '/channels/:channelId/messages',
  validate({ params: channelParam, query: messageListQuery }),
  asyncRoute(async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    const q = validQuery(req, messageListQuery);
    noStore(res);
    ok(res, await service.listMessages(principal(req), channelId, { limit: q.limit, cursor: q.cursor }));
  }),
);

chatRouter.get(
  '/channels/:channelId/messages/:messageId/thread',
  validate({ params: messageParam }),
  asyncRoute(async (req, res) => {
    const { channelId, messageId } = req.params as { channelId: string; messageId: string };
    ok(res, await service.listThread(principal(req), channelId, messageId));
  }),
);

chatRouter.post(
  '/channels/:channelId/messages',
  messageLimiter,
  requirePermission('chat:write'),
  validate({ params: channelParam, body: sendMessageSchema }),
  asyncRoute(async (req, res) => {
    const { channelId } = req.params as { channelId: string };
    created(res, await service.sendMessage(principal(req), channelId, validBody(req, sendMessageSchema)));
  }),
);

chatRouter.patch(
  '/channels/:channelId/messages/:messageId',
  writeLimiter,
  requirePermission('chat:write'),
  validate({ params: messageParam, body: editMessageSchema }),
  asyncRoute(async (req, res) => {
    const { channelId, messageId } = req.params as { channelId: string; messageId: string };
    const { body } = validBody(req, editMessageSchema);
    ok(res, await service.editMessage(principal(req), channelId, messageId, body));
  }),
);

chatRouter.delete(
  '/channels/:channelId/messages/:messageId',
  writeLimiter,
  requirePermission('chat:message_delete_own'),
  validate({ params: messageParam }),
  asyncRoute(async (req, res) => {
    const { channelId, messageId } = req.params as { channelId: string; messageId: string };
    await service.deleteMessage(principal(req), channelId, messageId);
    noContent(res);
  }),
);

chatRouter.post(
  '/channels/:channelId/messages/:messageId/reactions',
  messageLimiter,
  requirePermission('chat:write'),
  validate({ params: messageParam, body: reactionSchema }),
  asyncRoute(async (req, res) => {
    const { channelId, messageId } = req.params as { channelId: string; messageId: string };
    const { emoji } = validBody(req, reactionSchema);
    ok(res, await service.toggleReaction(principal(req), channelId, messageId, emoji));
  }),
);

chatRouter.post(
  '/channels/:channelId/read',
  validate({ params: channelParam }),
  asyncRoute(async (req, res) => {
    await service.markRead(principal(req), (req.params as { channelId: string }).channelId);
    noContent(res);
  }),
);
