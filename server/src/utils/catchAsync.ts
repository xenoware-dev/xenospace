import type { NextFunction, Request, Response } from 'express'

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>

// Express 5 forwards rejected promises automatically, but wrapping keeps
// intent explicit and guards against any accidental non-Express usage.
export const catchAsync = (handler: AsyncHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
