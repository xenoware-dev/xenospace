import { Router } from 'express'

import authRoutes from '@/routes/auth.routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Xenospace API is running' })
})

router.use('/auth', authRoutes)

export default router
