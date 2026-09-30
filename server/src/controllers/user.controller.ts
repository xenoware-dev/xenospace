import type { Request, Response } from 'express'

import { userService } from '@/services/user.service'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const listUsers = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, search, role, department, status } = req.query as unknown as {
    page: number
    limit: number
    search?: string
    role?: Parameters<typeof userService.listUsers>[0]['role']
    department?: string
    status?: 'active' | 'inactive'
  }

  const result = await userService.listUsers({ page, limit, search, role, department, status })
  ApiResponse.send(res, 200, 'Users', result)
})

export const getUser = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.getUserById(String(req.params.id))
  ApiResponse.send(res, 200, 'User', { user })
})

export const updateOwnProfile = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateOwnProfile(String(req.user!._id), req.body)
  ApiResponse.send(res, 200, 'Profile updated', { user })
})

export const updateUserRole = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateUserRole(req.user!, String(req.params.id), req.body.role)
  ApiResponse.send(res, 200, 'Role updated', { user })
})

export const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const user = await userService.updateUserStatus(req.user!, String(req.params.id), req.body.isActive)
  ApiResponse.send(res, 200, 'Status updated', { user })
})
