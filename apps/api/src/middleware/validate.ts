import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { badRequest } from '../lib/errors.js';

/**
 * Request validation.
 *
 * Every handler reads its input from `req.valid`, never from `req.body` or
 * `req.query` directly. That is the single rule that keeps unvalidated,
 * unbounded or extra-key input from ever reaching a query — Zod strips unknown
 * keys by default, so a client cannot smuggle `role` into a profile update.
 */

export interface ValidatedRequest<B = unknown, Q = unknown, P = unknown> extends Request {
  valid: { body: B; query: Q; params: P };
}

/** Flattens a ZodError into the `{ field: [messages] }` shape clients expect. */
function fieldErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const errors: Record<string, string[]> = {};
    const valid: { body: unknown; query: unknown; params: unknown } = {
      body: undefined,
      query: undefined,
      params: undefined,
    };

    for (const source of ['body', 'query', 'params'] as const) {
      const schema = schemas[source];
      if (!schema) continue;
      // Express 5 exposes req.query as a getter, so it is copied rather than
      // assigned back over.
      const input = source === 'query' ? { ...req.query } : req[source];
      const result = schema.safeParse(input ?? {});
      if (result.success) {
        valid[source] = result.data;
      } else {
        // Prefix so a client can tell a bad query param from a bad body field.
        for (const [field, messages] of Object.entries(fieldErrors(result.error))) {
          const key = source === 'body' ? field : `${source}.${field}`;
          (errors[key] ??= []).push(...messages);
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return next(badRequest('Please check the highlighted fields.', errors));
    }

    (req as ValidatedRequest).valid = valid as ValidatedRequest['valid'];
    next();
  };
}

/** Typed accessors, so handlers get inference without repeating the generic. */
export function body<S extends ZodTypeAny>(req: Request, _schema?: S): z.infer<S> {
  return (req as ValidatedRequest).valid.body as z.infer<S>;
}
export function query<S extends ZodTypeAny>(req: Request, _schema?: S): z.infer<S> {
  return (req as ValidatedRequest).valid.query as z.infer<S>;
}
export function params<S extends ZodTypeAny>(req: Request, _schema?: S): z.infer<S> {
  return (req as ValidatedRequest).valid.params as z.infer<S>;
}
