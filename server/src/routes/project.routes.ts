import { Router } from 'express'

import * as projectController from '@/controllers/project.controller'
import { authorize, protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  createProjectSchema,
  listProjectsQuerySchema,
  projectIdSchema,
  projectMemberIdSchema,
  projectMemberSchema,
  updateProjectSchema,
} from '@/validators/project.validator'

const router = Router()

router.use(protect)

router.get('/', validate(listProjectsQuerySchema), projectController.listProjects)
router.get('/summary', projectController.getProjectSummary)
router.get('/:id', validate(projectIdSchema), projectController.getProject)

// Creating a project is a management action; changing one is additionally open to
// its own lead, which the service checks per project.
router.post(
  '/',
  authorize('ADMIN', 'MANAGER', 'TEAM_LEAD'),
  validate(createProjectSchema),
  projectController.createProject
)
router.patch('/:id', validate(updateProjectSchema), projectController.updateProject)
router.delete('/:id', validate(projectIdSchema), projectController.deleteProject)

router.post('/:id/members', validate(projectMemberSchema), projectController.addProjectMember)
router.delete(
  '/:id/members/:userId',
  validate(projectMemberIdSchema),
  projectController.removeProjectMember
)

export default router
