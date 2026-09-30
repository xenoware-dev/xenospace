import { Router } from 'express'

import * as userController from '@/controllers/user.controller'
import { authorize, protect } from '@/middleware/auth.middleware'
import { verifyOrigin } from '@/middleware/csrf.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  listUsersQuerySchema,
  updateOwnProfileSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  userIdSchema,
} from '@/validators/user.validator'

const router = Router()

router.use(protect)
router.use(verifyOrigin)

router.get('/', validate(listUsersQuerySchema), userController.listUsers)
router.patch('/me', validate(updateOwnProfileSchema), userController.updateOwnProfile)

router.patch(
  '/:id/role',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(updateUserRoleSchema),
  userController.updateUserRole
)
router.patch(
  '/:id/status',
  authorize('SUPER_ADMIN', 'ADMIN'),
  validate(updateUserStatusSchema),
  userController.updateUserStatus
)

router.get('/:id', validate(userIdSchema), userController.getUser)

export default router
