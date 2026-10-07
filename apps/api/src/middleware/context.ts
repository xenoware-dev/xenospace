import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES } from '@xenospace/shared';
import { requestId as makeRequestId } from '../auth/crypto.js';
import { AppError } from '../lib/errors.js';

/**
 * Attaches a request id and echoes it back, so a user-reported error message
 * can be traced to the exact log lines for that request.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  // Honour an upstream id when the proxy already assigned one, so a trace spans
  // the whole hop chain. Bounded and sanitised, since it is attacker-supplied.
  const incoming = req.get('x-request-id');
  const id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : makeRequestId();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

/** Rejects a body-bearing request that is not JSON, before the parser runs. */
export function requireJsonContentType(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(req.method)) return next();
  // Multipart uploads have their own router and content type.
  if (req.is('multipart/form-data')) return next();
  /*
   * A body-less POST is legitimate — /auth/refresh and /auth/logout carry
   * their state in cookies. Browsers send `Content-Length: 0` for these, and
   * that header is a *string*, so a truthiness check would treat "0" as a
   * body and reject the request with a 415.
   */
  const declaredLength = Number.parseInt(req.get('content-length') ?? '', 10);
  const hasBody = (Number.isFinite(declaredLength) && declaredLength > 0) || Boolean(req.get('transfer-encoding'));
  if (!hasBody) return next();
  if (!req.is('application/json')) {
    return next(new AppError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 'Send this request as application/json.'));
  }
  next();
}
