import { Router } from 'express'

import * as adminController from '@/controllers/admin.controller'
import { authorize, protect } from '@/middleware/auth.middleware'
import { verifyOrigin } from '@/middleware/csrf.middleware'

const router = Router()

router.use(protect)
router.use(verifyOrigin)
// Every route under /admin is org-wide, so the gate sits on the router rather
// than being repeated per endpoint. SUPER_ADMIN passes `authorize` implicitly.
router.use(authorize('ADMIN'))

router.get('/overview', adminController.getOverview)

export default router
