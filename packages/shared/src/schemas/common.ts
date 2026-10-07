import { z } from 'zod';

export const uuid = z.string().uuid('Must be a valid id');
export const isoDate = z.string().datetime({ offset: true });

/** Dates arriving as `YYYY-MM-DD` from date inputs. */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/**
 * Trimmed, non-empty text with a hard ceiling. Every free-text field in the API
 * goes through this so an unbounded body can never reach the database.
 */
export const text = (min: number, max: number, label = 'Value') =>
  z.string().trim().min(min, `${label} must be at least ${min} character${min === 1 ? '' : 's'}`).max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max: number, label = 'Value') =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).optional().or(z.literal('').transform(() => undefined));

export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

/** Project key, e.g. `XSP`. Used to build task references like `XSP-128`. */
export const projectKey = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(8)
  .regex(/^[A-Z][A-Z0-9]+$/, 'Start with a letter; use uppercase letters and numbers only');

export const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Expected a hex colour');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const cursorQuery = z.object({
  cursor: z.string().max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Boolean from a query string. `z.coerce.boolean()` treats any non-empty
 * string as true, so `?overdue=false` would have meant "only overdue".
 */
export const queryBool = z.preprocess(
  (v) => (v === 'true' || v === '1' || v === true ? true : v === 'false' || v === '0' || v === false ? false : v),
  z.boolean(),
);

export const sortOrder = z.enum(['asc', 'desc']).default('desc');

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

/** Shape of every non-2xx response body the API emits. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Field-level messages, keyed by dotted path, present on validation failures. */
    details?: Record<string, string[]>;
    requestId?: string;
  };
}

/**
 * A comma-separated list of enum values in a query string, e.g.
 * `?status=TODO,IN_PROGRESS`. Tolerates a repeated param too.
 */
export const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((raw) => {
      if (raw === undefined) return undefined;
      const parts = (Array.isArray(raw) ? raw : raw.split(','))
        .map((p) => p.trim())
        .filter(Boolean);
      return parts.length ? parts : undefined;
    })
    .pipe(z.array(z.enum(values)).optional());
