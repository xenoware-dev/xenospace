import type { Request, Response } from 'express'

import { taskService } from '@/services/task.service'
import type { Role, TaskPriority } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

function actorOf(req: Request) {
  return { id: String(req.user!._id), role: req.user!.role as Role }
}

export const listTasks = catchAsync(async (req: Request, res: Response) => {
  // `validate` has already coerced and defaulted these against the schema, so
  // they arrive in their final types rather than as raw strings.
  const query = req.query as unknown as {
    page: number
    limit: number
    search?: string
    list?: string
    priority?: TaskPriority
    project?: string
    assignee?: string
    creator?: string
    mine: boolean
    due?: 'overdue' | 'today' | 'week' | 'none'
    includeDone: boolean
    sort: 'board' | 'recent' | 'created' | 'dueDate' | 'priority' | 'title'
  }

  const result = await taskService.list({ ...query }, actorOf(req))

  ApiResponse.send(res, 200, 'Tasks', result)
})

export const getTaskSummary = catchAsync(async (req: Request, res: Response) => {
  const summary = await taskService.summary(actorOf(req))
  ApiResponse.send(res, 200, 'Task summary', { summary })
})

export const getTask = catchAsync(async (req: Request, res: Response) => {
  const task = await taskService.getById(String(req.params.id))
  ApiResponse.send(res, 200, 'Task', { task })
})

export const createTask = catchAsync(async (req: Request, res: Response) => {
  const task = await taskService.create(req.body, actorOf(req))
  ApiResponse.send(res, 201, 'Task created', { task })
})

export const updateTask = catchAsync(async (req: Request, res: Response) => {
  const task = await taskService.update(String(req.params.id), req.body, actorOf(req))
  ApiResponse.send(res, 200, 'Task updated', { task })
})

export const moveTask = catchAsync(async (req: Request, res: Response) => {
  const task = await taskService.move(String(req.params.id), req.body, actorOf(req))
  ApiResponse.send(res, 200, 'Task moved', { task })
})

export const setTaskDone = catchAsync(async (req: Request, res: Response) => {
  const done = req.body.done as boolean
  const task = await taskService.setDone(String(req.params.id), done, actorOf(req))
  ApiResponse.send(res, 200, done ? 'Task completed' : 'Task reopened', { task })
})

export const deleteTask = catchAsync(async (req: Request, res: Response) => {
  await taskService.remove(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Task deleted')
})
