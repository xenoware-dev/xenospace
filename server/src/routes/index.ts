import { Router } from 'express'

import authRoutes from '@/routes/auth.routes'
import calendarRoutes from '@/routes/calendar.routes'
import dashboardRoutes from '@/routes/dashboard.routes'
import departmentRoutes from '@/routes/department.routes'
import fileRoutes from '@/routes/file.routes'
import projectRoutes from '@/routes/project.routes'
import taskListRoutes from '@/routes/taskList.routes'
import taskRoutes from '@/routes/task.routes'
import userRoutes from '@/routes/user.routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Xenospace API is running' })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/departments', departmentRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/calendar', calendarRoutes)
router.use('/files', fileRoutes)
router.use('/projects', projectRoutes)
router.use('/tasks', taskRoutes)
router.use('/task-lists', taskListRoutes)

export default router
