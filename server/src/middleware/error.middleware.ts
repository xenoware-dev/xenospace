import type { NextFunction, Request, Response } from 'express'
import { MongooseError } from 'mongoose'

import { isProduction } from '@/config/env'
import { ApiError } from '@/utils/ApiError'

interface NormalizedError {
  statusCode: number
  message: string
  details?: unknown
}

function normalize(err: unknown): NormalizedError {
  if (err instanceof ApiError) {
    return { statusCode: err.statusCode, message: err.message, details: err.details }
  }

  // Errors thrown by the validate middleware are plain objects, not ApiError instances.
  if (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    'message' in err
  ) {
    const e = err as { statusCode: number; message: string; details?: unknown }
    return { statusCode: e.statusCode, message: e.message, details: e.details }
  }

  if (err instanceof MongooseError) {
    return { statusCode: 400, message: 'Invalid data provided' }
  }

  if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
    return { statusCode: 409, message: 'A record with this value already exists' }
  }

  return { statusCode: 500, message: 'Something went wrong on our end' }
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const { statusCode, message, details } = normalize(err)

  if (!isProduction && statusCode >= 500) {
    console.error(err)
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(!isProduction && statusCode >= 500 && err instanceof Error
      ? { stack: err.stack }
      : {}),
  })
}
