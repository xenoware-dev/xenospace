import type { Request, Response } from 'express'

import { projectService } from '@/services/project.service'
import type { ProjectPriority, ProjectStatus, Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

function actorOf(req: Request) {
  return { id: String(req.user!._id), role: req.user!.role as Role }
}

export const listProjects = catchAsync(async (req: Request, res: Response) => {
  // The validate middleware only writes its parsed output back onto req.body, so
  // query values still arrive as strings here and are coerced by hand.
  const query = req.query as Record<string, string | undefined>

  const result = await projectService.list(
    {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      search: query.search,
      status: query.status as ProjectStatus | undefined,
      priority: query.priority as ProjectPriority | undefined,
      department: query.department,
      lead: query.lead,
      member: query.member,
      mine: query.mine === 'true',
      sort: (query.sort as 'recent' | 'name' | 'dueDate' | 'progress') || 'recent',
      includeArchived: query.includeArchived === 'true',
    },
    actorOf(req)
  )

  ApiResponse.send(res, 200, 'Projects', result)
})

export const getProjectSummary = catchAsync(async (req: Request, res: Response) => {
  const summary = await projectService.summary(actorOf(req))
  ApiResponse.send(res, 200, 'Project summary', { summary })
})

export const getProject = catchAsync(async (req: Request, res: Response) => {
  const result = await projectService.getById(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Project', result)
})

export const createProject = catchAsync(async (req: Request, res: Response) => {
  const project = await projectService.create(req.body, actorOf(req))
  ApiResponse.send(res, 201, 'Project created', { project })
})

export const updateProject = catchAsync(async (req: Request, res: Response) => {
  const project = await projectService.update(String(req.params.id), req.body, actorOf(req))
  ApiResponse.send(res, 200, 'Project updated', { project })
})

export const deleteProject = catchAsync(async (req: Request, res: Response) => {
  await projectService.remove(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Project deleted')
})

export const addProjectMember = catchAsync(async (req: Request, res: Response) => {
  const project = await projectService.addMember(
    String(req.params.id),
    String(req.body.userId),
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Member added', { project })
})

export const removeProjectMember = catchAsync(async (req: Request, res: Response) => {
  const project = await projectService.removeMember(
    String(req.params.id),
    String(req.params.userId),
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Member removed', { project })
})
