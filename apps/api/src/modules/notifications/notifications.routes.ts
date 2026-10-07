import { Router } from 'express';
import { z } from 'zod';
import { markNotificationsSchema, notificationListQuery } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { noContent, noStore, ok } from '../../lib/http.js';
import * as service from './notifications.service.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate, requirePermission('notification:read'));

notificationsRouter.get(
  '/',
  validate({ query: notificationListQuery }),
  asyncRoute(async (req, res) => {
    const q = validQuery(req, notificationListQuery);
    noStore(res);
    ok(res, await service.listNotifications(principal(req).id, {
      limit: q.limit,
      cursor: q.cursor,
      unreadOnly: q.unreadOnly,
      kind: q.kind,
    }));
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, { unread: await service.unreadCount(principal(req).id) });
  }),
);

notificationsRouter.post(
  '/read',
  requirePermission('notification:manage'),
  validate({ body: markNotificationsSchema }),
  asyncRoute(async (req, res) => {
    const { ids, all } = validBody(req, markNotificationsSchema);
    const updated = await service.markRead(principal(req).id, ids, all);
    ok(res, { updated });
  }),
);

notificationsRouter.delete(
  '/:id',
  requirePermission('notification:manage'),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncRoute(async (req, res) => {
    await service.deleteNotification(principal(req).id, (req.params as { id: string }).id);
    noContent(res);
  }),
);
