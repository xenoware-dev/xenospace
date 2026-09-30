import { Router } from 'express'

import * as taskListController from '@/controllers/taskList.controller'
import { protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  createTaskListSchema,
  reorderTaskListsSchema,
  taskListIdSchema,
  updateTaskListSchema,
} from '@/validators/taskList.validator'

const router = Router()

router.use(protect)

// The board is shared, so anyone on it can add, rename and reorder columns.
// Deleting one takes its cards along, and is checked per list in the service.
router.get('/', taskListController.listTaskLists)
router.post('/', validate(createTaskListSchema), taskListController.createTaskList)
router.patch('/reorder', validate(reorderTaskListsSchema), taskListController.reorderTaskLists)
router.patch('/:id', validate(updateTaskListSchema), taskListController.updateTaskList)
router.delete('/:id', validate(taskListIdSchema), taskListController.deleteTaskList)

export default router
