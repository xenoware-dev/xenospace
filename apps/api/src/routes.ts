import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { membersRouter } from './modules/members/members.routes.js';
import { projectsRouter } from './modules/projects/projects.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { sprintsRouter } from './modules/sprints/sprints.routes.js';
import { issuesRouter } from './modules/issues/issues.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import { reposRouter } from './modules/repos/repos.routes.js';
import { deploymentsRouter } from './modules/deployments/deployments.routes.js';
import { calendarRouter } from './modules/calendar/calendar.routes.js';
import { kbRouter } from './modules/kb/kb.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { filesRouter } from './modules/files/files.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { activityRouter } from './modules/activity/activity.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';

/**
 * API surface, versioned under /api/v1.
 *
 * Routers are mounted here rather than in app.ts so the whole HTTP surface is
 * readable in one place. Each router applies its own `authenticate` and
 * permission middleware; none is applied globally, so a new router cannot
 * accidentally inherit authentication it did not ask for.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/members', membersRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/tasks', tasksRouter);
apiRouter.use('/sprints', sprintsRouter);
apiRouter.use('/issues', issuesRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/repos', reposRouter);
apiRouter.use('/deployments', deploymentsRouter);
apiRouter.use('/calendar', calendarRouter);
apiRouter.use('/kb', kbRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use('/files', filesRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/activity', activityRouter);
apiRouter.use('/dashboard', dashboardRouter);
