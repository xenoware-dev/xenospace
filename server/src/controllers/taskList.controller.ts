import type { Request, Response } from 'express'

import { taskListService } from '@/services/taskList.service'
import type { Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

function actorOf(req: Request) {
  return { id: String(req.user!._id), role: req.user!.role as Role }
}

export const listTaskLists = catchAsync(async (req: Request, res: Response) => {
  const lists = await taskListService.list(actorOf(req))
  ApiResponse.send(res, 200, 'Lists', { lists })
})

export const createTaskList = catchAsync(async (req: Request, res: Response) => {
  const taskList = await taskListService.create(req.body, actorOf(req))
  ApiResponse.send(res, 201, 'List created', { list: taskList })
})

export const updateTaskList = catchAsync(async (req: Request, res: Response) => {
  const taskList = await taskListService.update(String(req.params.id), req.body)
  ApiResponse.send(res, 200, 'List updated', { list: taskList })
})

export const reorderTaskLists = catchAsync(async (req: Request, res: Response) => {
  const lists = await taskListService.reorder(req.body.ids)
  ApiResponse.send(res, 200, 'Lists reordered', { lists })
})

export const deleteTaskList = catchAsync(async (req: Request, res: Response) => {
  const result = await taskListService.remove(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'List deleted', result)
})
