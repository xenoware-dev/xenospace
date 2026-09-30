import { Router } from 'express'

import * as departmentController from '@/controllers/department.controller'
import { authorize, protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  createDepartmentSchema,
  departmentIdSchema,
  updateDepartmentSchema,
} from '@/validators/department.validator'

const router = Router()

router.use(protect)

router.get('/', departmentController.listDepartments)
router.post(
  '/',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(createDepartmentSchema),
  departmentController.createDepartment
)
router.patch(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(updateDepartmentSchema),
  departmentController.updateDepartment
)
router.delete(
  '/:id',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(departmentIdSchema),
  departmentController.deleteDepartment
)

export default router
