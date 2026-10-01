import { Router } from 'express'

import * as workController from '@/controllers/work.controller'
import { protect } from '@/middleware/auth.middleware'

const router = Router()

router.use(protect)

// Everything assigned to the caller, across every project.
router.get('/mine', workController.getMyWork)
// What the whole team is carrying. The service checks the role, so a member
// gets a clear refusal rather than a route that looks like it does not exist.
router.get('/workload', workController.getWorkload)

export default router
