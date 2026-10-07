import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Permission } from '@xenospace/shared';
import { useAuth } from '@/lib/auth.jsx';
import { AppShell } from '@/components/shell/AppShell.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';
import { StatusPage } from '@/components/StatusPage.jsx';
import { Button, LinkButton } from '@/components/ui/Button.jsx';
import { Search, Shield } from '@/components/icons.jsx';
import { LoginPage } from '@/pages/auth/Login.jsx';
import { RegisterPage } from '@/pages/auth/Register.jsx';
import { ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth/ForgotPassword.jsx';
import { AuthCallbackPage } from '@/pages/auth/AuthCallback.jsx';
import { AccessDeniedPage } from '@/pages/auth/AccessDenied.jsx';

/**
 * Routing.
 *
 * Pages are code-split so the initial bundle carries the shell and the route
 * the user actually landed on, not all thirty screens. Each guarded route
 * names the permission it needs, mirroring the API — the client guard is for
 * UX, and the server remains the authority.
 */

const Dashboard = lazy(() => import('@/pages/Dashboard.jsx').then((m) => ({ default: m.DashboardPage })));
const Projects = lazy(() => import('@/pages/Projects.jsx').then((m) => ({ default: m.ProjectsPage })));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail.jsx').then((m) => ({ default: m.ProjectDetailPage })));
const Team = lazy(() => import('@/pages/Team.jsx').then((m) => ({ default: m.TeamPage })));
const MemberDetail = lazy(() => import('@/pages/Team.jsx').then((m) => ({ default: m.MemberDetailPage })));
const Tasks = lazy(() => import('@/pages/Tasks.jsx').then((m) => ({ default: m.TasksPage })));
const TaskDetail = lazy(() => import('@/pages/TaskDetail.jsx').then((m) => ({ default: m.TaskDetailPage })));
const Board = lazy(() => import('@/pages/Board.jsx').then((m) => ({ default: m.BoardPage })));
const Sprints = lazy(() => import('@/pages/Sprints.jsx').then((m) => ({ default: m.SprintsPage })));
const Issues = lazy(() => import('@/pages/Issues.jsx').then((m) => ({ default: m.IssuesPage })));
const IssueDetail = lazy(() => import('@/pages/IssueDetail.jsx').then((m) => ({ default: m.IssueDetailPage })));
const CodeReview = lazy(() => import('@/pages/CodeReview.jsx').then((m) => ({ default: m.CodeReviewPage })));
const ReviewDetail = lazy(() => import('@/pages/ReviewDetail.jsx').then((m) => ({ default: m.ReviewDetailPage })));
const Repositories = lazy(() => import('@/pages/Repositories.jsx').then((m) => ({ default: m.RepositoriesPage })));
const Deployments = lazy(() => import('@/pages/Deployments.jsx').then((m) => ({ default: m.DeploymentsPage })));
const Calendar = lazy(() => import('@/pages/Calendar.jsx').then((m) => ({ default: m.CalendarPage })));
const Knowledge = lazy(() => import('@/pages/Knowledge.jsx').then((m) => ({ default: m.KnowledgePage })));
const Chat = lazy(() => import('@/pages/Chat.jsx').then((m) => ({ default: m.ChatPage })));
const Files = lazy(() => import('@/pages/Files.jsx').then((m) => ({ default: m.FilesPage })));
const Activity = lazy(() => import('@/pages/Activity.jsx').then((m) => ({ default: m.ActivityPage })));
const Audit = lazy(() => import('@/pages/Audit.jsx').then((m) => ({ default: m.AuditPage })));
const Reports = lazy(() => import('@/pages/Reports.jsx').then((m) => ({ default: m.ReportsPage })));
const Notifications = lazy(() => import('@/pages/Notifications.jsx').then((m) => ({ default: m.NotificationsPage })));
const Settings = lazy(() => import('@/pages/Settings.jsx').then((m) => ({ default: m.SettingsPage })));

/** Blocks a route until the session is known, then redirects if anonymous. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--surface-page)]">
        <LoadingState label="Restoring your session" />
      </div>
    );
  }
  if (status === 'anonymous') {
    // Carries the attempted path so sign-in returns the user where they were.
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

/** Sends an already-signed-in user away from the auth pages. */
function RequireAnonymous({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--surface-page)]">
        <LoadingState />
      </div>
    );
  }
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * Permission gate.
 *
 * Renders an explanation rather than redirecting: silently bouncing someone to
 * the dashboard reads as a bug, whereas naming the missing access is actionable.
 */
function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { allows } = useAuth();
  if (!allows(permission)) {
    return (
      <StatusPage
        code="403"
        tone="warning"
        icon={<Shield size={22} />}
        title="This area is for team leads"
        message="Your account is a developer account, so this page is not available to you."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>
            <LinkButton to="/dashboard" variant="primary">Go to dashboard</LinkButton>
          </>
        }
        footnote="If you need access, ask your team lead."
      />
    );
  }
  return <>{children}</>;
}

/** Suspense boundary for a lazily loaded page. */
function PageSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState className="min-h-[60vh]" />}>{children}</Suspense>;
}

const guarded = (permission: Permission, element: ReactNode) => (
  <PageSuspense>
    <RequirePermission permission={permission}>{element}</RequirePermission>
  </PageSuspense>
);

export function AppRoutes() {
  return (
    <Routes>
      {/* ---------------------------------------------------------- public */}
      <Route path="/login" element={<RequireAnonymous><LoginPage /></RequireAnonymous>} />
      <Route path="/register" element={<RequireAnonymous><RegisterPage /></RequireAnonymous>} />
      <Route path="/accept-invite" element={<RequireAnonymous><RegisterPage /></RequireAnonymous>} />
      <Route path="/forgot-password" element={<RequireAnonymous><ForgotPasswordPage /></RequireAnonymous>} />
      <Route path="/reset-password" element={<RequireAnonymous><ResetPasswordPage /></RequireAnonymous>} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />

      {/* ------------------------------------------------------ app shell */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<PageSuspense><Dashboard /></PageSuspense>} />

        <Route path="/projects" element={guarded('project:read', <Projects />)} />
        <Route path="/projects/:id" element={guarded('project:read', <ProjectDetail />)} />

        {/* The directory is a team-lead page (hidden from the developer nav);
            individual colleague profiles stay readable to developers. */}
        <Route path="/team" element={guarded('member:invite', <Team />)} />
        <Route path="/team/:id" element={guarded('member:read', <MemberDetail />)} />

        <Route path="/tasks" element={guarded('task:read', <Tasks />)} />
        <Route path="/tasks/:id" element={guarded('task:read', <TaskDetail />)} />
        <Route path="/board" element={guarded('task:read', <Board />)} />
        <Route path="/sprints" element={guarded('sprint:read', <Sprints />)} />

        <Route path="/issues" element={guarded('issue:read', <Issues />)} />
        <Route path="/issues/:id" element={guarded('issue:read', <IssueDetail />)} />

        <Route path="/code-review" element={guarded('review:read', <CodeReview />)} />
        <Route path="/code-review/:id" element={guarded('review:read', <ReviewDetail />)} />
        <Route path="/repositories" element={guarded('repo:read', <Repositories />)} />
        <Route path="/deployments" element={guarded('deploy:read', <Deployments />)} />

        <Route path="/chat" element={guarded('chat:read', <Chat />)} />
        <Route path="/chat/:channelId" element={guarded('chat:read', <Chat />)} />
        <Route path="/calendar" element={guarded('calendar:read', <Calendar />)} />
        <Route path="/knowledge" element={guarded('kb:read', <Knowledge />)} />
        <Route path="/knowledge/:id" element={guarded('kb:read', <Knowledge />)} />
        <Route path="/files" element={guarded('file:read', <Files />)} />

        <Route path="/activity" element={guarded('activity:read', <Activity />)} />
        <Route path="/audit" element={guarded('audit:read', <Audit />)} />
        <Route path="/reports" element={guarded('report:read_all', <Reports />)} />

        <Route path="/notifications" element={guarded('notification:read', <Notifications />)} />
        <Route path="/settings" element={<PageSuspense><Settings /></PageSuspense>} />
      </Route>

      {/* --------------------------------------------------------- unknown */}
      <Route
        path="*"
        element={
          <StatusPage
            fullScreen
            code="404"
            icon={<Search size={22} />}
            title="Page not found"
            message="That link does not lead anywhere in XenoSpace. It may have been mistyped, or the page has moved."
            actions={
              <>
                <Button variant="secondary" onClick={() => window.history.back()}>Go back</Button>
                <LinkButton to="/dashboard" variant="primary">Go to dashboard</LinkButton>
              </>
            }
          />
        }
      />
    </Routes>
  );
}
