import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

export const validate =
  (schema: z.ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    })

    if (!result.success) {
      const details = z.flattenError(result.error)
      next({ statusCode: 422, message: 'Validation failed', details, isOperational: true })
      return
    }

    const parsed = result.data as { body?: unknown; query?: unknown }
    if (parsed.body) req.body = parsed.body
    // Express 5 exposes `req.query` as a lazy getter, so a plain assignment is
    // silently dropped — which meant every coerced number arrived as a string
    // and every schema default never arrived at all. Redefining the property is
    // what actually hands the controller the parsed value it is typed against.
    if (parsed.query) {
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    }
    next()
  }
