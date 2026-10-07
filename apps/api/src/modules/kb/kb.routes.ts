import { Router } from 'express';
import { z } from 'zod';
import { createKbNoteSchema, kbListQuery, updateKbNoteSchema } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission, requireAnyPermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './kb.service.js';

export const kbRouter = Router();
const idParam = z.object({ id: z.string().uuid() });
const projectQuery = z.object({ projectId: z.string().uuid().optional() });

kbRouter.use(authenticate);

kbRouter.get(
  '/',
  requirePermission('kb:read'),
  validate({ query: kbListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listNotes(principal(req), validQuery(req, kbListQuery)));
  }),
);

kbRouter.get(
  '/graph',
  requirePermission('kb:read'),
  validate({ query: projectQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.graph(principal(req), validQuery(req, projectQuery).projectId));
  }),
);

kbRouter.get(
  '/facets',
  requirePermission('kb:read'),
  asyncRoute(async (req, res) => {
    ok(res, await service.facets(principal(req)));
  }),
);

kbRouter.get(
  '/:id',
  requirePermission('kb:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getNote(principal(req), (req.params as { id: string }).id));
  }),
);

kbRouter.post(
  '/',
  writeLimiter,
  requirePermission('kb:create'),
  validate({ body: createKbNoteSchema }),
  asyncRoute(async (req, res) => {
    const note = await service.createNote(principal(req), validBody(req, createKbNoteSchema));
    created(res, note, `/api/v1/kb/${note.id}`);
  }),
);

kbRouter.patch(
  '/:id',
  writeLimiter,
  requireAnyPermission('kb:update', 'kb:update_own'),
  validate({ params: idParam, body: updateKbNoteSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateNote(principal(req), id, validBody(req, updateKbNoteSchema)));
  }),
);

kbRouter.delete(
  '/:id',
  writeLimiter,
  requireAnyPermission('kb:delete', 'kb:update_own'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    await service.deleteNote(principal(req), (req.params as { id: string }).id);
    noContent(res);
  }),
);
