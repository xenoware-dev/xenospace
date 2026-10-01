import { Router } from 'express'

import adminRoutes from '@/routes/admin.routes'
import authRoutes from '@/routes/auth.routes'
import calendarRoutes from '@/routes/calendar.routes'
import dashboardRoutes from '@/routes/dashboard.routes'
import departmentRoutes from '@/routes/department.routes'
import fileRoutes from '@/routes/file.routes'
import knowledgeRoutes from '@/routes/knowledge.routes'
import notificationRoutes from '@/routes/notification.routes'
import projectRoutes from '@/routes/project.routes'
import taskListRoutes from '@/routes/taskList.routes'
import taskRoutes from '@/routes/task.routes'
import userRoutes from '@/routes/user.routes'
import workRoutes from '@/routes/work.routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'Xenospace API is running' })
})

router.use('/auth', authRoutes)
router.use('/admin', adminRoutes)
router.use('/users', userRoutes)
router.use('/departments', departmentRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/calendar', calendarRoutes)
router.use('/files', fileRoutes)
router.use('/knowledge', knowledgeRoutes)
router.use('/notifications', notificationRoutes)
router.use('/projects', projectRoutes)
router.use('/tasks', taskRoutes)
router.use('/task-lists', taskListRoutes)
router.use('/work', workRoutes)

export default router
