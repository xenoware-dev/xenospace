import type { Request, Response } from 'express'

import { adminService } from '@/services/admin.service'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const getOverview = catchAsync(async (_req: Request, res: Response) => {
  const overview = await adminService.overview()

  ApiResponse.send(res, 200, 'Admin overview', overview)
})
