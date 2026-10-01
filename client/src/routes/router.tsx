import { createBrowserRouter, Navigate } from 'react-router-dom'

import { AdminRoute } from '@/components/common/AdminRoute'
import { GuestRoute } from '@/components/common/GuestRoute'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import LoginPage from '@/features/auth/pages/LoginPage'
import RegisterPage from '@/features/auth/pages/RegisterPage'
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage'
import VerifyEmailPage from '@/features/auth/pages/VerifyEmailPage'
import CalendarPage from '@/features/calendar/pages/CalendarPage'
import DashboardPage from '@/features/dashboard/pages/DashboardPage'
import FilesPage from '@/features/files/pages/FilesPage'
import ArticleEditorPage from '@/features/knowledge/pages/ArticleEditorPage'
import ArticlePage from '@/features/knowledge/pages/ArticlePage'
import KnowledgeBasePage from '@/features/knowledge/pages/KnowledgeBasePage'
import NotificationsPage from '@/features/notifications/pages/NotificationsPage'
import ProfilePage from '@/features/profile/pages/ProfilePage'
import ProjectDetailPage from '@/features/projects/pages/ProjectDetailPage'
import ProjectsPage from '@/features/projects/pages/ProjectsPage'
import TasksPage from '@/features/tasks/pages/TasksPage'
import TeamDirectoryPage from '@/features/team/pages/TeamDirectoryPage'
import TeamMemberPage from '@/features/team/pages/TeamMemberPage'
import MyWorkPage from '@/features/work/pages/MyWorkPage'
import WorkloadPage from '@/features/work/pages/WorkloadPage'
import AdminDashboardPage from '@/features/admin/pages/AdminDashboardPage'
import OrganizationSettingsPage from '@/features/admin/pages/OrganizationSettingsPage'
import UserManagementPage from '@/features/admin/pages/UserManagementPage'
import { AuthLayout } from '@/layouts/AuthLayout'
import ComingSoonPage from '@/pages/ComingSoonPage'
import NotFoundPage from '@/pages/NotFoundPage'
import SettingsPage from '@/pages/SettingsPage'

export const router = createBrowserRouter([
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
    ],
  },
  {
    element: <AuthLayout />,
    children: [{ path: '/verify-email', element: <VerifyEmailPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: '/my-work', element: <MyWorkPage /> },
          // The service refuses a member, and the page renders that refusal,
          // so the route stays open rather than 404-ing on a real page.
          { path: '/workload', element: <WorkloadPage /> },
          { path: '/forum', element: <ComingSoonPage /> },
          { path: '/projects', element: <ProjectsPage /> },
          { path: '/projects/:id', element: <ProjectDetailPage /> },
          { path: '/tasks', element: <TasksPage /> },
          { path: '/team', element: <TeamDirectoryPage /> },
          { path: '/team/:id', element: <TeamMemberPage /> },
          { path: '/messages', element: <ComingSoonPage /> },
          { path: '/knowledge-base', element: <KnowledgeBasePage /> },
          // The composer comes before /:slug, so "new" is not read as a slug.
          { path: '/knowledge-base/new', element: <ArticleEditorPage /> },
          { path: '/knowledge-base/:slug', element: <ArticlePage /> },
          { path: '/knowledge-base/:slug/edit', element: <ArticleEditorPage /> },
          { path: '/files', element: <FilesPage /> },
          { path: '/calendar', element: <CalendarPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/settings', element: <SettingsPage /> },
          {
            element: <AdminRoute />,
            children: [
              { path: '/admin', element: <AdminDashboardPage /> },
              { path: '/admin/users', element: <UserManagementPage /> },
              { path: '/admin/roles', element: <ComingSoonPage /> },
              { path: '/admin/organization', element: <OrganizationSettingsPage /> },
              { path: '/admin/audit-logs', element: <ComingSoonPage /> },
              { path: '/admin/system', element: <ComingSoonPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '/404', element: <NotFoundPage /> },
  { path: '*', element: <Navigate to="/404" replace /> },
])
