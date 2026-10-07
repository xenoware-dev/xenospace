import type { Permission, Role } from './rbac.js';
import type {
  ChannelKind, DeployEnvironment, DeployStatus, DocVisibility, EventKind, GitProvider,
  IssueKind, IssueStatus, NotificationKind, PresenceState, Priority, ProjectStatus,
  ReviewStatus, Severity, SprintStatus, TaskStatus, TaskType, UserStatus,
} from './domain.js';

/** A user as any other user may see them. Never carries credentials. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  avatarUrl: string | null;
  avatarColor: string;
  jobTitle: string | null;
  presence: PresenceState;
  lastSeenAt: string | null;
}

/** The authenticated user's own record, including private preferences. */
export interface CurrentUser extends PublicUser {
  bio: string | null;
  timezone: string;
  phone: string | null;
  location: string | null;
  githubHandle: string | null;
  skills: string[];
  weeklyHours: number;
  permissions: Permission[];
  preferences: UserPreferences;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  accent: string;
  reducedMotion: boolean;
  emailDigest: 'off' | 'daily' | 'weekly';
  notifyOn: Partial<Record<NotificationKind, boolean>>;
  defaultProjectId: string | null;
}

export interface AuthSession {
  user: CurrentUser;
  /** Short-lived bearer token. The refresh token lives only in an httpOnly cookie. */
  accessToken: string;
  expiresIn: number;
}

export interface DeviceSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** True for the session making the request, which the UI must not let you revoke blindly. */
  current: boolean;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
  status: ProjectStatus;
  color: string;
  startDate: string | null;
  targetDate: string | null;
  lead: PublicUser | null;
  memberCount: number;
  members?: ProjectMember[];
  /** Rolled-up counters, cheap enough to send with the list. */
  stats: ProjectStats;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStats {
  totalTasks: number;
  doneTasks: number;
  openIssues: number;
  openReviews: number;
  /** 0-100, derived from done vs total story points, falling back to task counts. */
  progress: number;
  activeSprintId: string | null;
}

export interface ProjectMember {
  user: PublicUser;
  projectRole: 'LEAD' | 'MEMBER' | 'VIEWER';
  joinedAt: string;
  openTasks: number;
}

export interface Task {
  id: string;
  /** Human reference, e.g. `XSP-128`. */
  reference: string;
  projectId: string;
  project?: Pick<Project, 'id' | 'name' | 'key' | 'color'>;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  assignee: PublicUser | null;
  reporter: PublicUser;
  sprintId: string | null;
  parentTaskId: string | null;
  estimate: number | null;
  position: number;
  dueDate: string | null;
  labels: string[];
  commentCount: number;
  attachmentCount: number;
  subtaskCount: number;
  doneSubtaskCount: number;
  blockedBy: Array<Pick<Task, 'id' | 'reference' | 'title' | 'status'>>;
  loggedMinutes: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Comment {
  id: string;
  body: string;
  author: PublicUser;
  createdAt: string;
  updatedAt: string | null;
  editedBy: string | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string;
  endDate: string;
  capacityPoints: number | null;
  committedPoints: number;
  completedPoints: number;
  taskCount: number;
  doneTaskCount: number;
  retrospective: string | null;
  /** Points remaining per day, for the burndown chart. */
  burndown: Array<{ date: string; remaining: number; ideal: number }>;
  createdAt: string;
}

export interface Issue {
  id: string;
  reference: string;
  projectId: string;
  project?: Pick<Project, 'id' | 'name' | 'key' | 'color'>;
  title: string;
  description: string;
  kind: IssueKind;
  severity: Severity;
  status: IssueStatus;
  assignee: PublicUser | null;
  reporter: PublicUser;
  stepsToReproduce: string | null;
  expectedBehaviour: string | null;
  actualBehaviour: string | null;
  environment: string | null;
  affectedVersion: string | null;
  labels: string[];
  linkedTaskId: string | null;
  resolution: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface CodeReview {
  id: string;
  reference: string;
  projectId: string;
  repositoryId: string | null;
  title: string;
  description: string | null;
  status: ReviewStatus;
  author: PublicUser;
  reviewers: Array<{ user: PublicUser; verdict: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'; respondedAt: string | null }>;
  sourceBranch: string;
  targetBranch: string;
  externalNumber: number | null;
  externalUrl: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commentCount: number;
  unresolvedCount: number;
  linkedTaskId: string | null;
  /** Set when the review mirrors a GitHub pull request; merge and close happen on GitHub. */
  syncedFromGitHub: boolean;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export interface ReviewComment extends Comment {
  filePath: string | null;
  line: number | null;
  parentId: string | null;
  resolved: boolean;
}

export interface Repository {
  id: string;
  projectId: string;
  provider: GitProvider;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
  /** True when a token is stored; the token itself is never serialised. */
  hasCredentials: boolean;
  openPullRequests: number;
  lastSyncedAt: string | null;
  /** Why the last sync failed, in words for whoever connected it; null when it worked. */
  lastSyncError: string | null;
  /** A sync is running right now. */
  syncing: boolean;
  branches: RepoBranch[];
  recentCommits: RepoCommit[];
  createdAt: string;
}

/** A commit, branch or pull request on GitHub that mentions a task. */
export interface TaskGitLink {
  id: string;
  kind: 'COMMIT' | 'PULL_REQUEST' | 'BRANCH';
  /** Commit SHA, pull request number or branch name. */
  ref: string;
  title: string;
  url: string | null;
  /** OPEN / MERGED / CLOSED for pull requests. */
  state: string | null;
  author: string | null;
  occurredAt: string | null;
  repository: { id: string; fullName: string };
}

export interface RepoBranch {
  name: string;
  isDefault: boolean;
  ahead: number;
  behind: number;
  lastCommitAt: string | null;
  author: string | null;
}

export interface RepoCommit {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  additions: number;
  deletions: number;
  url: string | null;
}

export interface Deployment {
  id: string;
  projectId: string;
  repositoryId: string | null;
  environment: DeployEnvironment;
  version: string;
  status: DeployStatus;
  commitSha: string | null;
  branch: string | null;
  triggeredBy: PublicUser;
  approvedBy: PublicUser | null;
  notes: string | null;
  logUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CalendarEvent {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  kind: EventKind;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  meetingUrl: string | null;
  organizer: PublicUser;
  attendees: Array<{ user: PublicUser; response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' }>;
  recurrenceRule: string | null;
  reminderMinutes: number | null;
  createdAt: string;
}

export interface KbNote {
  id: string;
  projectId: string | null;
  title: string;
  content: string;
  tags: string[];
  visibility: DocVisibility;
  folder: string | null;
  icon: string | null;
  author: PublicUser;
  lastEditedBy: PublicUser | null;
  /** Titles this note links out to via `[[wiki links]]`. */
  outboundLinks: Array<{ id: string | null; title: string }>;
  inboundLinks: Array<{ id: string; title: string }>;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  name: string;
  topic: string | null;
  kind: ChannelKind;
  projectId: string | null;
  memberCount: number;
  members?: PublicUser[];
  unreadCount: number;
  lastMessage: ChatMessage | null;
  /** Null until the viewer has opened the channel at least once. */
  lastReadAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  clientId: string | null;
  author: PublicUser;
  body: string;
  parentId: string | null;
  replyCount: number;
  mentions: string[];
  attachments: StoredFile[];
  reactions: Array<{ emoji: string; count: number; userIds: string[] }>;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface StoredFile {
  id: string;
  projectId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string | null;
  folder: string | null;
  description: string | null;
  visibility: DocVisibility;
  uploadedBy: PublicUser;
  createdAt: string;
}

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** In-app route the notification deep-links to. */
  link: string | null;
  actor: PublicUser | null;
  readAt: string | null;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  actor: PublicUser | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  projectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/* ------------------------------------------------------------------ analytics */

export interface AdminDashboard {
  kpis: {
    activeProjects: number;
    openTasks: number;
    overdueTasks: number;
    openIssues: number;
    criticalIssues: number;
    pendingReviews: number;
    deploysThisWeek: number;
    teamSize: number;
  };
  /** Completed vs created tasks over the window. */
  throughput: Array<{ date: string; created: number; completed: number }>;
  velocity: Array<{ sprint: string; committed: number; completed: number }>;
  workloadByMember: Array<{ user: PublicUser; openTasks: number; points: number; capacity: number }>;
  tasksByStatus: Array<{ status: TaskStatus; count: number }>;
  issuesBySeverity: Array<{ severity: Severity; count: number }>;
  deploymentHealth: { succeeded: number; failed: number; rolledBack: number; successRate: number };
  recentActivity: ActivityEntry[];
  upcomingEvents: CalendarEvent[];
  projectProgress: Array<{ project: Pick<Project, 'id' | 'name' | 'key' | 'color'>; progress: number; dueInDays: number | null }>;
}

export interface DeveloperDashboard {
  profile: CurrentUser;
  kpis: {
    assignedTasks: number;
    inProgress: number;
    dueToday: number;
    overdue: number;
    completedThisWeek: number;
    openIssues: number;
    reviewsRequested: number;
    loggedMinutesThisWeek: number;
  };
  /** The developer's own completion trend. */
  personalThroughput: Array<{ date: string; completed: number; logged: number }>;
  tasksByPriority: Array<{ priority: Priority; count: number }>;
  focusTasks: Task[];
  reviewQueue: CodeReview[];
  myIssues: Issue[];
  upcomingEvents: CalendarEvent[];
  activeSprint: Sprint | null;
  /** Longest run of consecutive days with a completed task. */
  streakDays: number;
  contributionHeatmap: Array<{ date: string; count: number }>;
}

export interface ReportBundle {
  generatedAt: string;
  range: { from: string; to: string };
  summary: {
    tasksCompleted: number;
    tasksCreated: number;
    issuesResolved: number;
    reviewsMerged: number;
    deployments: number;
    avgCycleTimeHours: number | null;
    avgReviewTimeHours: number | null;
  };
  burndown: Array<{ date: string; remaining: number; ideal: number }>;
  cumulativeFlow: Array<{ date: string } & Partial<Record<TaskStatus, number>>>;
  memberBreakdown: Array<{ user: PublicUser; completed: number; points: number; loggedMinutes: number }>;
  cycleTimeByType: Array<{ type: TaskType; hours: number }>;
}
