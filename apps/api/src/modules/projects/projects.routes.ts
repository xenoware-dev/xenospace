import { Router } from 'express';
import { z } from 'zod';
import {
  createProjectSchema, projectListQuery, projectMemberSchema, updateProjectSchema,
} from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { auditFromRequest } from '../../middleware/audit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './projects.service.js';
import { listMembers } from './projects.service.js';

export const projectsRouter = Router();
const idParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

projectsRouter.use(authenticate);

projectsRouter.get(
  '/',
  requirePermission('project:read'),
  validate({ query: projectListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listProjects(principal(req), validQuery(req, projectListQuery)));
  }),
);

/** Compact list for pickers; mounted before `/:id` so it is not shadowed. */
projectsRouter.get(
  '/options',
  requirePermission('project:read'),
  asyncRoute(async (req, res) => {
    ok(res, await service.projectOptions(principal(req)));
  }),
);

projectsRouter.get(
  '/:id',
  requirePermission('project:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getProject(principal(req), (req.params as { id: string }).id));
  }),
);

projectsRouter.post(
  '/',
  writeLimiter,
  requirePermission('project:create'),
  validate({ body: createProjectSchema }),
  asyncRoute(async (req, res) => {
    const project = await service.createProject(principal(req), validBody(req, createProjectSchema));
    auditFromRequest(req, { action: 'project.create', resource: 'project', resourceId: project.id });
    created(res, project, `/api/v1/projects/${project.id}`);
  }),
);

projectsRouter.patch(
  '/:id',
  writeLimiter,
  requirePermission('project:update'),
  validate({ params: idParam, body: updateProjectSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const project = await service.updateProject(principal(req), id, validBody(req, updateProjectSchema));
    auditFromRequest(req, { action: 'project.update', resource: 'project', resourceId: id });
    ok(res, project);
  }),
);

projectsRouter.delete(
  '/:id',
  writeLimiter,
  requirePermission('project:delete'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    await service.deleteProject(principal(req), id);
    auditFromRequest(req, { action: 'project.delete', resource: 'project', resourceId: id });
    noContent(res);
  }),
);

projectsRouter.get(
  '/:id/members',
  requirePermission('project:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    const { assertProjectAccess } = await import('../common/access.js');
    const id = (req.params as { id: string }).id;
    await assertProjectAccess(principal(req), id);
    ok(res, await listMembers(id));
  }),
);

projectsRouter.post(
  '/:id/members',
  writeLimiter,
  requirePermission('project:manage_members'),
  validate({ params: idParam, body: projectMemberSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const members = await service.addMember(principal(req), id, validBody(req, projectMemberSchema));
    auditFromRequest(req, { action: 'project.member_add', resource: 'project', resourceId: id });
    ok(res, members);
  }),
);

projectsRouter.delete(
  '/:id/members/:userId',
  writeLimiter,
  requirePermission('project:manage_members'),
  validate({ params: memberParam }),
  asyncRoute(async (req, res) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const members = await service.removeMember(principal(req), id, userId);
    auditFromRequest(req, { action: 'project.member_remove', resource: 'project', resourceId: id, metadata: { userId } });
    ok(res, members);
  }),
);
