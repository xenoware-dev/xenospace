import { Router } from 'express'

import authRoutes from '@/routes/auth.routes'
import departmentRoutes from '@/routes/department.routes'
import userRoutes from '@/routes/user.routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Xenospace API is running' })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/departments', departmentRoutes)

export default router
