import { Router } from 'express';
import { z } from 'zod';
import { createDeploymentSchema, deploymentListQuery, updateDeploymentSchema } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { created, ok } from '../../lib/http.js';
import * as service from './deployments.service.js';

export const deploymentsRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

deploymentsRouter.use(authenticate);

deploymentsRouter.get(
  '/',
  requirePermission('deploy:read'),
  validate({ query: deploymentListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listDeployments(principal(req), validQuery(req, deploymentListQuery)));
  }),
);

deploymentsRouter.get(
  '/environments',
  requirePermission('deploy:read'),
  validate({ query: z.object({ projectId: z.string().uuid().optional() }) }),
  asyncRoute(async (req, res) => {
    const { projectId } = validQuery(req, z.object({ projectId: z.string().uuid().optional() }));
    ok(res, await service.environmentStatus(principal(req), projectId));
  }),
);

deploymentsRouter.get(
  '/:id',
  requirePermission('deploy:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getDeployment(principal(req), (req.params as { id: string }).id));
  }),
);

deploymentsRouter.post(
  '/',
  writeLimiter,
  requirePermission('deploy:create'),
  validate({ body: createDeploymentSchema }),
  asyncRoute(async (req, res) => {
    const deployment = await service.createDeployment(principal(req), validBody(req, createDeploymentSchema));
    created(res, deployment, `/api/v1/deployments/${deployment.id}`);
  }),
);

deploymentsRouter.patch(
  '/:id',
  writeLimiter,
  requirePermission('deploy:create'),
  validate({ params: idParam, body: updateDeploymentSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateDeployment(principal(req), id, validBody(req, updateDeploymentSchema)));
  }),
);

deploymentsRouter.post(
  '/:id/rollback',
  writeLimiter,
  requirePermission('deploy:rollback'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.rollback(principal(req), (req.params as { id: string }).id));
  }),
);
