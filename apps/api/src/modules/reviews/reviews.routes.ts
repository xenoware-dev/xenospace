import { Router } from 'express';
import { z } from 'zod';
import {
  createReviewSchema, reviewCommentSchema, reviewListQuery, reviewVerdictSchema,
} from '@xenospace/shared';
import { asyncRoute } from '../../middleware/error.js';
import { authenticate, principal, requirePermission } from '../../middleware/authenticate.js';
import { validate, body as validBody, query as validQuery } from '../../middleware/validate.js';
import { writeLimiter } from '../../middleware/rateLimit.js';
import { created, ok } from '../../lib/http.js';
import * as service from './reviews.service.js';

export const reviewsRouter = Router();
const idParam = z.object({ id: z.string().uuid() });
const commentParam = z.object({ id: z.string().uuid(), commentId: z.string().uuid() });

reviewsRouter.use(authenticate);

reviewsRouter.get(
  '/',
  requirePermission('review:read'),
  validate({ query: reviewListQuery }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listReviews(principal(req), validQuery(req, reviewListQuery)));
  }),
);

reviewsRouter.get(
  '/:id',
  requirePermission('review:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.getReview(principal(req), (req.params as { id: string }).id));
  }),
);

reviewsRouter.post(
  '/',
  writeLimiter,
  requirePermission('review:create'),
  validate({ body: createReviewSchema }),
  asyncRoute(async (req, res) => {
    const review = await service.createReview(principal(req), validBody(req, createReviewSchema));
    created(res, review, `/api/v1/reviews/${review.id}`);
  }),
);

reviewsRouter.post(
  '/:id/verdict',
  writeLimiter,
  requirePermission('review:comment'),
  validate({ params: idParam, body: reviewVerdictSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    ok(res, await service.submitVerdict(principal(req), id, validBody(req, reviewVerdictSchema)));
  }),
);

reviewsRouter.post(
  '/:id/merge',
  writeLimiter,
  requirePermission('review:merge'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.mergeReview(principal(req), (req.params as { id: string }).id));
  }),
);

reviewsRouter.post(
  '/:id/close',
  writeLimiter,
  requirePermission('review:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.closeReview(principal(req), (req.params as { id: string }).id));
  }),
);

reviewsRouter.get(
  '/:id/comments',
  requirePermission('review:read'),
  validate({ params: idParam }),
  asyncRoute(async (req, res) => {
    ok(res, await service.listComments(principal(req), (req.params as { id: string }).id));
  }),
);

reviewsRouter.post(
  '/:id/comments',
  writeLimiter,
  requirePermission('review:comment'),
  validate({ params: idParam, body: reviewCommentSchema }),
  asyncRoute(async (req, res) => {
    const id = (req.params as { id: string }).id;
    created(res, await service.addComment(principal(req), id, validBody(req, reviewCommentSchema)));
  }),
);

reviewsRouter.put(
  '/:id/comments/:commentId/resolved',
  writeLimiter,
  requirePermission('review:comment'),
  validate({ params: commentParam, body: z.object({ resolved: z.boolean() }) }),
  asyncRoute(async (req, res) => {
    const { id, commentId } = req.params as { id: string; commentId: string };
    const { resolved } = validBody(req, z.object({ resolved: z.boolean() }));
    ok(res, await service.resolveComment(principal(req), id, commentId, resolved));
  }),
);
