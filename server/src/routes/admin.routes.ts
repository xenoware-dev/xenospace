import { Router } from 'express'

import * as adminController from '@/controllers/admin.controller'
import { authorize, protect } from '@/middleware/auth.middleware'
import { verifyOrigin } from '@/middleware/csrf.middleware'
import { validate } from '@/middleware/validate.middleware'
import { auditLogQuerySchema } from '@/validators/admin.validator'

const router = Router()

router.use(protect)
router.use(verifyOrigin)
// Every route under /admin is org-wide, so the gate sits on the router rather
// than being repeated per endpoint. SUPER_ADMIN passes `authorize` implicitly.
router.use(authorize('ADMIN'))

router.get('/overview', adminController.getOverview)
router.get('/roles', adminController.getRoles)
router.get('/system', adminController.getSystem)
router.get('/audit-log', validate(auditLogQuerySchema), adminController.getAuditLog)

export default router
