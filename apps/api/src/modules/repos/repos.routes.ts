import { Router } from 'express';
import { z } from 'zod';
import { connectRepoSchema, updateRepoSchema } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './repos.service.js';

export const reposRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

reposRouter.use(authenticate);

reposRouter.get(
  '/',
  requirePermission('repo:read'),
  validate({ query: z.object({ projectId: z.string().uuid().optional() }) }),
  asyncRoute(async (req, res) => {
    const { projectId } = validQuery(req, z.object({ projectId: z.string().uuid().optional() }));
    ok(res, await service.listRepos(principal(req), projectId));
  }),
);

const activityQuery = z.object({
  projectId: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

reposRouter.get(
  '/activity',
  requirePermission('repo:read'),
  validate({ query: activityQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.commitActivity(principal(req), validQuery(req, activityQuery)));
  }),
);

reposRouter.get(
  '/:id',
  requirePermission('repo:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getRepo(principal(req), (req.params as { id: string }).id));
  }),
);

reposRouter.post(
  '/',
  writeLimiter,
  requirePermission('repo:connect'),
  validate({ body: connectRepoSchema }),
  asyncRoute(async (req, res) => {
    const repo = await service.connectRepo(principal(req), validBody(req, connectRepoSchema));
    created(res, repo, `/api/v1/repos/${repo.id}`);
  }),
);

reposRouter.patch(
  '/:id',
  writeLimiter,
  requirePermission('repo:update'),
  validate({ params: idParam, body: updateRepoSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateRepo(principal(req), id, validBody(req, updateRepoSchema)));
  }),
);

reposRouter.post(
  '/:id/sync',
  writeLimiter,
  requirePermission('repo:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.requestSync(principal(req), (req.params as { id: string }).id));
  }),
);

reposRouter.delete(
  '/:id',
  writeLimiter,
  requirePermission('repo:disconnect'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    await service.disconnectRepo(principal(req), (req.params as { id: string }).id);
    noContent(res);
  }),
);
