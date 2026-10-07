import { Router } from 'express';
import { z } from 'zod';
import { activityListQuery } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, query as validQuery } from '../../middleware/validate.js';
import { noStore, ok } from '../../lib/http.js';
import * as service from './activity.service.js';

export const activityRouter = Router();

activityRouter.use(authenticate);

activityRouter.get(
  '/',
  requirePermission('activity:read'),
  validate({ query: activityListQuery }),
  asyncRoute(async (req, res) => {
    const q = validQuery(req, activityListQuery);
    ok(res, await service.listActivity(principal(req), q));
  }),
);

const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(64).optional(),
  action: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE', 'DENIED']).optional(),
});

activityRouter.get(
  '/audit',
  requirePermission('audit:read'),
  validate({ query: auditQuery }),
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.listAudit(validQuery(req, auditQuery)));
  }),
);
