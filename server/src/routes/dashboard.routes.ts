import { Router } from 'express'

import * as dashboardController from '@/controllers/dashboard.controller'
import { protect } from '@/middleware/auth.middleware'

const router = Router()

router.use(protect)

// One call backs the dashboard, the sidebar counts and the navigator tree.
router.get('/', dashboardController.getDashboard)

export default router
