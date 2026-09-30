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

    const parsed = result.data as { body?: unknown }
    if (parsed.body) req.body = parsed.body
    next()
  }
