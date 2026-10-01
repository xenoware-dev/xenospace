import type { Request, Response } from 'express'

import { dashboardService } from '@/services/dashboard.service'
import type { Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const getDashboard = catchAsync(async (req: Request, res: Response) => {
  const overview = await dashboardService.overview({
    id: String(req.user!._id),
    role: req.user!.role as Role,
  })

  ApiResponse.send(res, 200, 'Dashboard', overview)
})
