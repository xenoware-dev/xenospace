import { Router } from 'express';
import { z } from 'zod';
import {
  assignTaskSchema, createTaskSchema, logTimeSchema, moveTaskSchema,
  taskCommentSchema, taskListQuery, updateTaskSchema,
} from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission, requireAnyPermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { auditFromRequest } from '../../middleware/audit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './tasks.service.js';
import { listTaskGitLinks } from '../repos/repos.service.js';

export const tasksRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

tasksRouter.use(authenticate);

tasksRouter.get(
  '/',
  requirePermission('task:read'),
  validate({ query: taskListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listTasks(principal(req), validQuery(req, taskListQuery)));
  }),
);

const boardQuery = z.object({
  projectId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
  assigneeId: z.union([z.string().uuid(), z.literal('me')]).optional(),
});

tasksRouter.get(
  '/board',
  requirePermission('task:read'),
  validate({ query: boardQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getBoard(principal(req), validQuery(req, boardQuery)));
  }),
);

tasksRouter.get(
  '/:id',
  requirePermission('task:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getTask(principal(req), (req.params as { id: string }).id));
  }),
);

tasksRouter.post(
  '/',
  writeLimiter,
  requirePermission('task:create'),
  validate({ body: createTaskSchema }),
  asyncRoute(async (req, res) => {
    const task = await service.createTask(principal(req), validBody(req, createTaskSchema));
    auditFromRequest(req, { action: 'task.create', resource: 'task', resourceId: task.id });
    created(res, task, `/api/v1/tasks/${task.id}`);
  }),
);

tasksRouter.patch(
  '/:id',
  writeLimiter,
  // Either permission gets you in; ownership is then enforced in the service.
  requireAnyPermission('task:update', 'task:update_own'),
  validate({ params: idParam, body: updateTaskSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateTask(principal(req), id, validBody(req, updateTaskSchema)));
  }),
);

tasksRouter.post(
  '/:id/move',
  writeLimiter,
  requirePermission('task:transition'),
  validate({ params: idParam, body: moveTaskSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.moveTask(principal(req), id, validBody(req, moveTaskSchema)));
  }),
);

tasksRouter.post(
  '/:id/assign',
  writeLimiter,
  requirePermission('task:assign'),
  validate({ params: idParam, body: assignTaskSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const { assigneeId } = validBody(req, assignTaskSchema);
    auditFromRequest(req, { action: 'task.assign', resource: 'task', resourceId: id, metadata: { assigneeId } });
    ok(res, await service.assignTask(principal(req), id, assigneeId));
  }),
);

tasksRouter.delete(
  '/:id',
  writeLimiter,
  requirePermission('task:delete'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    await service.deleteTask(principal(req), id);
    auditFromRequest(req, { action: 'task.delete', resource: 'task', resourceId: id });
    noContent(res);
  }),
);

tasksRouter.get(
  '/:id/git',
  requirePermission('task:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    // getTask enforces project access (404 for a task the caller cannot see).
    await service.getTask(principal(req), id);
    ok(res, await listTaskGitLinks(id));
  }),
);

tasksRouter.get(
  '/:id/comments',
  requirePermission('task:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listComments(principal(req), (req.params as { id: string }).id));
  }),
);

tasksRouter.post(
  '/:id/comments',
  writeLimiter,
  requirePermission('task:read'),
  validate({ params: idParam, body: taskCommentSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    created(res, await service.addComment(principal(req), id, validBody(req, taskCommentSchema)));
  }),
);

tasksRouter.post(
  '/:id/time',
  writeLimiter,
  requirePermission('task:estimate'),
  validate({ params: idParam, body: logTimeSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.logTime(principal(req), id, validBody(req, logTimeSchema)));
  }),
);
