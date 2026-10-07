import { Router } from 'express';
import { z } from 'zod';
import { completeSprintSchema, createSprintSchema, updateSprintSchema } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './sprints.service.js';

export const sprintsRouter = Router();
const idParam = z.object({ id: z.string().uuid() });
const projectQuery = z.object({ projectId: z.string().uuid().optional() });

sprintsRouter.use(authenticate);

sprintsRouter.get(
  '/',
  requirePermission('sprint:read'),
  validate({ query: projectQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listSprints(principal(req), validQuery(req, projectQuery).projectId));
  }),
);

sprintsRouter.get(
  '/velocity',
  requirePermission('sprint:read'),
  validate({ query: z.object({ projectId: z.string().uuid() }) }),
  asyncRoute(async (req, res) => {
    const { projectId } = validQuery(req, z.object({ projectId: z.string().uuid() }));
    ok(res, await service.velocity(principal(req), projectId));
  }),
);

sprintsRouter.get(
  '/:id',
  requirePermission('sprint:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getSprint(principal(req), (req.params as { id: string }).id));
  }),
);

sprintsRouter.post(
  '/',
  writeLimiter,
  requirePermission('sprint:create'),
  validate({ body: createSprintSchema }),
  asyncRoute(async (req, res) => {
    const sprint = await service.createSprint(principal(req), validBody(req, createSprintSchema));
    created(res, sprint, `/api/v1/sprints/${sprint.id}`);
  }),
);

sprintsRouter.patch(
  '/:id',
  writeLimiter,
  requirePermission('sprint:update'),
  validate({ params: idParam, body: updateSprintSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateSprint(principal(req), id, validBody(req, updateSprintSchema)));
  }),
);

sprintsRouter.post(
  '/:id/start',
  writeLimiter,
  requirePermission('sprint:start'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.startSprint(principal(req), (req.params as { id: string }).id));
  }),
);

sprintsRouter.post(
  '/:id/complete',
  writeLimiter,
  requirePermission('sprint:complete'),
  validate({ params: idParam, body: completeSprintSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.completeSprint(principal(req), id, validBody(req, completeSprintSchema)));
  }),
);

sprintsRouter.delete(
  '/:id',
  writeLimiter,
  requirePermission('sprint:delete'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    await service.deleteSprint(principal(req), (req.params as { id: string }).id);
    noContent(res);
  }),
);
