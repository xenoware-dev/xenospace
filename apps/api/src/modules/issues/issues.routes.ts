import { Router } from 'express';
import { z } from 'zod';
import {
  createIssueSchema, issueListQuery, resolveIssueSchema, taskCommentSchema, updateIssueSchema,
} from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission, requireAnyPermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { auditFromRequest } from '../../middleware/audit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './issues.service.js';

export const issuesRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

issuesRouter.use(authenticate);

issuesRouter.get(
  '/',
  requirePermission('issue:read'),
  validate({ query: issueListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listIssues(principal(req), validQuery(req, issueListQuery)));
  }),
);

issuesRouter.get(
  '/:id',
  requirePermission('issue:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getIssue(principal(req), (req.params as { id: string }).id));
  }),
);

issuesRouter.post(
  '/',
  writeLimiter,
  requirePermission('issue:create'),
  validate({ body: createIssueSchema }),
  asyncRoute(async (req, res) => {
    const issue = await service.createIssue(principal(req), validBody(req, createIssueSchema));
    created(res, issue, `/api/v1/issues/${issue.id}`);
  }),
);

issuesRouter.patch(
  '/:id',
  writeLimiter,
  requireAnyPermission('issue:update', 'issue:update_own'),
  validate({ params: idParam, body: updateIssueSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateIssue(principal(req), id, validBody(req, updateIssueSchema)));
  }),
);

issuesRouter.post(
  '/:id/resolve',
  writeLimiter,
  requirePermission('issue:close'),
  validate({ params: idParam, body: resolveIssueSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.resolveIssue(principal(req), id, validBody(req, resolveIssueSchema)));
  }),
);

issuesRouter.delete(
  '/:id',
  writeLimiter,
  requirePermission('issue:delete'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    await service.deleteIssue(principal(req), id);
    auditFromRequest(req, { action: 'issue.delete', resource: 'issue', resourceId: id });
    noContent(res);
  }),
);

issuesRouter.get(
  '/:id/comments',
  requirePermission('issue:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listComments(principal(req), (req.params as { id: string }).id));
  }),
);

issuesRouter.post(
  '/:id/comments',
  writeLimiter,
  requirePermission('issue:read'),
  validate({ params: idParam, body: taskCommentSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    created(res, await service.addComment(principal(req), id, validBody(req, taskCommentSchema)));
  }),
);
