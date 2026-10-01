import type { Request, Response } from 'express'

import { adminService } from '@/services/admin.service'
import { auditService } from '@/services/audit.service'
import type { AuditAction } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

export const getOverview = catchAsync(async (_req: Request, res: Response) => {
  const overview = await adminService.overview()

  ApiResponse.send(res, 200, 'Admin overview', overview)
})

export const getRoles = catchAsync(async (_req: Request, res: Response) => {
  const roles = await adminService.roles()

  ApiResponse.send(res, 200, 'Roles and capabilities', roles)
})

export const getSystem = catchAsync(async (_req: Request, res: Response) => {
  const system = await adminService.system()

  ApiResponse.send(res, 200, 'System status', system)
})

export const getAuditLog = catchAsync(async (req: Request, res: Response) => {
  const { page, limit, action, actor, search } = req.query as unknown as {
    page: number
    limit: number
    action?: AuditAction
    actor?: string
    search?: string
  }

  // The summary strip and the actor filter describe the whole log rather than
  // the current page, so they are fetched alongside it in one round trip.
  const [result, summary, actors] = await Promise.all([
    auditService.list({ page, limit, action, actor, search }),
    auditService.summary(),
    auditService.actors(),
  ])

  ApiResponse.send(res, 200, 'Audit log', { ...result, summary, actors })
})
