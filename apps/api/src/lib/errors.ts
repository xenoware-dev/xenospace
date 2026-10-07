import { ERROR_CODES, ERROR_MESSAGE, type ErrorCode } from '@xenospace/shared';

/**
 * The only error type route handlers should throw deliberately.
 *
 * Everything else that escapes a handler is treated as a bug and reported to
 * the client as a generic 500, so an unexpected stack trace or driver message
 * can never leak through the response body.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: Record<string, string[]>;
  /** Response headers the error requires, e.g. `Retry-After` on a 429. */
  readonly headers?: Record<string, string>;
  /** Extra context for the log only. Never serialised to the client. */
  readonly meta?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    message?: string,
    opts: { details?: Record<string, string[]>; headers?: Record<string, string>; meta?: Record<string, unknown> } = {},
  ) {
    super(message ?? ERROR_MESSAGE[code]);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (opts.details) this.details = opts.details;
    if (opts.headers) this.headers = opts.headers;
    if (opts.meta) this.meta = opts.meta;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (message?: string, details?: Record<string, string[]>) =>
  new AppError(400, ERROR_CODES.VALIDATION_FAILED, message, details ? { details } : {});

export const unauthenticated = (code: ErrorCode = ERROR_CODES.UNAUTHENTICATED, message?: string) =>
  new AppError(401, code, message);

export const forbidden = (message?: string, meta?: Record<string, unknown>) =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message, meta ? { meta } : {});

/**
 * 404 for anything the caller may not see.
 *
 * Authorization failures on a specific record also return this, not 403: a 403
 * would confirm the record exists, letting an attacker enumerate ids across
 * projects they have no access to.
 */
export const notFound = (what = 'Resource') =>
  new AppError(404, ERROR_CODES.NOT_FOUND, `${what} not found`);

export const conflict = (message?: string, code: ErrorCode = ERROR_CODES.CONFLICT) =>
  new AppError(409, code, message);

export const tooLarge = (message?: string) =>
  new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message);

export const unsupportedMedia = (message?: string) =>
  new AppError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, message);

export const rateLimited = (retryAfterSeconds: number, message?: string) =>
  new AppError(429, ERROR_CODES.RATE_LIMITED, message, {
    headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  });

export const internal = (message?: string, meta?: Record<string, unknown>) =>
  new AppError(500, ERROR_CODES.INTERNAL, message, meta ? { meta } : {});

export const illegalTransition = (from: string, to: string) =>
  new AppError(422, ERROR_CODES.ILLEGAL_TRANSITION, `Cannot move from ${from} to ${to}.`, {
    meta: { from, to },
  });

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** Maps a Postgres driver error to the right client-facing failure. */
export function fromDatabaseError(err: unknown): AppError | null {
  const pgCode = (err as { code?: string } | null)?.code;
  if (!pgCode) return null;
  switch (pgCode) {
    case '23505': // unique_violation
      return conflict('That already exists.');
    case '23503': // foreign_key_violation
      return badRequest('A referenced record does not exist.');
    case '23514': // check_violation
      return badRequest('That value is not allowed.');
    case '22P02': // invalid_text_representation, e.g. a malformed uuid
      return badRequest('A supplied value was malformed.');
    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return conflict('The record changed while you were editing. Reload and try again.');
    default:
      return null;
  }
}
