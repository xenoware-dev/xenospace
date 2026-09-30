import type { Response } from 'express'

export class ApiResponse {
  static send(
    res: Response,
    statusCode: number,
    message: string,
    data: unknown = null
  ) {
    return res.status(statusCode).json({
      success: statusCode < 400,
      message,
      data,
    })
  }
}
