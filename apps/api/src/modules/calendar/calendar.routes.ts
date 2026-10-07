import { Router } from 'express';
import { z } from 'zod';
import { createEventSchema, eventRangeQuery, rsvpSchema, updateEventSchema } from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { created, noContent, ok } from '../../lib/http.js';
import * as service from './calendar.service.js';

export const calendarRouter = Router();
const idParam = z.object({ id: z.string().uuid() });

calendarRouter.use(authenticate);

calendarRouter.get(
  '/',
  requirePermission('calendar:read'),
  validate({ query: eventRangeQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listEvents(principal(req), validQuery(req, eventRangeQuery)));
  }),
);

calendarRouter.get(
  '/upcoming',
  requirePermission('calendar:read'),
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }) }),
  asyncRoute(async (req, res) => {
    const { limit } = validQuery(req, z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }));
    ok(res, await service.upcoming(principal(req), limit));
  }),
);

calendarRouter.get(
  '/:id',
  requirePermission('calendar:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getEvent(principal(req), (req.params as { id: string }).id));
  }),
);

calendarRouter.post(
  '/',
  writeLimiter,
  requirePermission('calendar:create'),
  validate({ body: createEventSchema }),
  asyncRoute(async (req, res) => {
    const event = await service.createEvent(principal(req), validBody(req, createEventSchema));
    created(res, event, `/api/v1/calendar/${event.id}`);
  }),
);

calendarRouter.patch(
  '/:id',
  writeLimiter,
  requirePermission('calendar:update'),
  validate({ params: idParam, body: updateEventSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.updateEvent(principal(req), id, validBody(req, updateEventSchema)));
  }),
);

calendarRouter.post(
  '/:id/rsvp',
  writeLimiter,
  requirePermission('calendar:read'),
  validate({ params: idParam, body: rsvpSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    const { response } = validBody(req, rsvpSchema);
    ok(res, await service.rsvp(principal(req), id, response));
  }),
);

calendarRouter.delete(
  '/:id',
  writeLimiter,
  requirePermission('calendar:delete'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    await service.deleteEvent(principal(req), (req.params as { id: string }).id);
    noContent(res);
  }),
);
