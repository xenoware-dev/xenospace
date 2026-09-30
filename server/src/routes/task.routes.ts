import { Router } from 'express'

import * as taskController from '@/controllers/task.controller'
import { protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  taskIdSchema,
  updateTaskSchema,
} from '@/validators/task.validator'

const router = Router()

router.use(protect)

router.get('/', validate(listTasksQuerySchema), taskController.listTasks)
router.get('/summary', taskController.getTaskSummary)
router.get('/:id', validate(taskIdSchema), taskController.getTask)

// Anyone may keep their own todos; who can change an existing task is decided
// per task in the service.
router.post('/', validate(createTaskSchema), taskController.createTask)
router.patch('/:id', validate(updateTaskSchema), taskController.updateTask)
// Rearranging the shared board is open to everyone on it, unlike editing a card.
router.patch('/:id/move', validate(moveTaskSchema), taskController.moveTask)
router.delete('/:id', validate(taskIdSchema), taskController.deleteTask)

export default router
