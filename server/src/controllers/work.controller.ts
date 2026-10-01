import type { Request, Response } from 'express'

import { workService } from '@/services/work.service'
import type { Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const getMyWork = catchAsync(async (req: Request, res: Response) => {
  const work = await workService.myWork(String(req.user!._id))
  ApiResponse.send(res, 200, 'Your work', work)
})

export const getWorkload = catchAsync(async (req: Request, res: Response) => {
  const workload = await workService.workload({
    id: String(req.user!._id),
    role: req.user!.role as Role,
  })
  ApiResponse.send(res, 200, 'Team workload', workload)
})
