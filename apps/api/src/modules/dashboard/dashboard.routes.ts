import { Router } from 'express';
import { reportQuery } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, query as validQuery } from '../../middleware/validate.js';
import { noStore, ok } from '../../lib/http.js';
import { forbidden } from '../../lib/errors.js';
import * as service from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

/** Workspace-wide analytics. Team leads only. */
dashboardRouter.get(
  '/admin',
  requirePermission('report:read_all'),
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.adminDashboard(principal(req)));
  }),
);

/** The caller's own analytics. Available to any authenticated user. */
dashboardRouter.get(
  '/me',
  requirePermission('report:read'),
  asyncRoute(async (req, res) => {
    noStore(res);
    ok(res, await service.developerDashboard(principal(req)));
  }),
);

dashboardRouter.get(
  '/reports',
  requirePermission('report:read'),
  validate({ query: reportQuery }),
  asyncRoute(async (req, res) => {
    const q = validQuery(req, reportQuery);
    // A workspace-wide report needs the broader permission; scoping to a single
    // project is enough for a developer, and that project is access-checked.
    const { can } = await import('@xenospace/shared');
    if (!q.projectId && !can(principal(req).role, 'report:read_all')) {
      throw forbidden('Choose a project to report on.');
    }
    ok(res, await service.report(principal(req), q));
  }),
);
