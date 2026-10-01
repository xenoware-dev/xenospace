import type { Request, Response } from 'express'

import { departmentService } from '@/services/department.service'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const listDepartments = catchAsync(async (_req: Request, res: Response) => {
  const departments = await departmentService.list()
  ApiResponse.send(res, 200, 'Departments', { departments })
})

export const createDepartment = catchAsync(async (req: Request, res: Response) => {
  const department = await departmentService.create(req.body, { user: req.user!, ip: req.ip })
  ApiResponse.send(res, 201, 'Department created', { department })
})

export const updateDepartment = catchAsync(async (req: Request, res: Response) => {
  const department = await departmentService.update(String(req.params.id), req.body, {
    user: req.user!,
    ip: req.ip,
  })
  ApiResponse.send(res, 200, 'Department updated', { department })
})

export const deleteDepartment = catchAsync(async (req: Request, res: Response) => {
  await departmentService.remove(String(req.params.id), { user: req.user!, ip: req.ip })
  ApiResponse.send(res, 200, 'Department deleted')
})
