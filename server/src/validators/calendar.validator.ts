import { z } from 'zod'

import { CALENDAR_EVENT_KINDS } from '@/types/enums'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

/** Filters accept the literal "none" to mean "not set", as the task list does. */
const objectIdOrNone = z.union([objectId, z.literal('none')])

const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

export const listCalendarQuerySchema = z.object({
  query: z
    .object({
      /** Inclusive start and exclusive end of the window on screen. */
      from: z.coerce.date(),
      to: z.coerce.date(),
      project: objectIdOrNone.optional(),
      assignee: objectIdOrNone.optional(),
      /** Assigned to the caller, plus their own unassigned todos. */
      mine: boolFlag,
      includeDone: boolFlag,
      /**
       * Which layers to draw, as a comma-separated list. Left out, every layer
       * comes back — a bare range request is the common case.
       */
      kinds: z
        .string()
        .trim()
        .optional()
        .transform((value) =>
          value
            ? value
                .split(',')
                .map((kind) => kind.trim())
                .filter((kind): kind is (typeof CALENDAR_EVENT_KINDS)[number] =>
                  (CALENDAR_EVENT_KINDS as readonly string[]).includes(kind)
                )
            : [...CALENDAR_EVENT_KINDS]
        ),
    })
    // A month of grid is ~6 weeks; anything much wider is a runaway query.
    .refine((query) => query.to > query.from, {
      message: 'The end of the range must fall after its start',
      path: ['to'],
    })
    .refine(
      (query) => query.to.getTime() - query.from.getTime() <= 400 * 24 * 60 * 60 * 1000,
      { message: 'That range is too wide', path: ['to'] }
    ),
})
