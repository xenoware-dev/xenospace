import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiErrorBody } from '@xenospace/shared';
import { AppError, fromDatabaseError, isAppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

/** 404 for any route that did not match. Mounted after all routers. */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `No route for ${req.method} ${req.path}`,
      requestId: req.requestId,
    },
  };
  res.status(404).json(body);
}

/**
 * Terminal error handler.
 *
 * The contract: a client only ever learns what an `AppError` chose to tell it.
 * Anything else is logged in full and reported as a bare 500, so a driver
 * message, file path or stack trace cannot become part of the API surface.
 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  // Streaming had already begun, so the status is committed; let Express abort.
  if (res.headersSent) return next(err);

  let appError: AppError;

  if (isAppError(err)) {
    appError = err;
  } else if (err instanceof ZodError) {
    // A schema that ran outside the validate middleware, e.g. in a service.
    appError = new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Please check the highlighted fields.', {
      details: err.issues.reduce<Record<string, string[]>>((acc, issue) => {
        const key = issue.path.join('.') || '_';
        (acc[key] ??= []).push(issue.message);
        return acc;
      }, {}),
    });
  } else if (isBodyParserError(err)) {
    appError = new AppError(
      err.type === 'entity.too.large' ? 413 : 400,
      err.type === 'entity.too.large' ? ERROR_CODES.PAYLOAD_TOO_LARGE : ERROR_CODES.VALIDATION_FAILED,
      err.type === 'entity.too.large' ? 'That request is too large.' : 'The request body could not be parsed.',
    );
  } else {
    appError = fromDatabaseError(err) ?? new AppError(500, ERROR_CODES.INTERNAL);
  }

  const logPayload = {
    err,
    requestId: req.requestId,
    userId: req.user?.id,
    method: req.method,
    path: req.path,
    status: appError.status,
    code: appError.code,
    ...(appError.meta ?? {}),
  };

  // 5xx is our bug; 4xx is the caller's. Only the former deserves error level.
  if (appError.status >= 500) logger.error(logPayload, 'request failed');
  else if (appError.status === 403 || appError.status === 429) logger.warn(logPayload, 'request denied');
  else logger.debug(logPayload, 'request rejected');

  for (const [header, value] of Object.entries(appError.headers ?? {})) {
    res.setHeader(header, value);
  }

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      ...(req.requestId ? { requestId: req.requestId } : {}),
    },
  };

  // Outside production, surface the real message on a 500 — locally this is the
  // difference between a usable stack trace and a guessing game.
  if (!isProd && appError.status >= 500 && err instanceof Error) {
    (body.error as Record<string, unknown>).debug = { message: err.message, stack: err.stack?.split('\n').slice(0, 6) };
  }

  res.status(appError.status).json(body);
}

function isBodyParserError(err: unknown): err is { type: string; status?: number } {
  return typeof (err as { type?: unknown })?.type === 'string' && 'expose' in (err as object);
}

/**
 * Wraps an async handler so a rejected promise reaches the error handler.
 * Express 5 forwards rejections natively, but this keeps the intent explicit
 * and the typing clean at every call site.
 */
export function asyncRoute<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}
