-- XenoSpace core schema.
--
-- Conventions, applied throughout:
--   * ids are uuid, defaulted with gen_random_uuid() (Postgres 13+ core).
--   * enum-like columns are text + CHECK, mirroring packages/shared/src/domain.ts.
--     Text keeps migrations cheap; the CHECK keeps the database authoritative, so
--     a bug in the API cannot persist a status the UI can't render.
--   * every timestamp is timestamptz. There are no naive timestamps anywhere.
--   * deletes cascade from the owning aggregate and SET NULL from references
--     that are merely informational (an actor who later leaves, say).

CREATE TABLE schema_migrations (
  id          text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  checksum    text NOT NULL
);

/* ---------------------------------------------------------------- identity */

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL,
  -- Argon2id PHC string. Null for accounts that only ever sign in with OAuth.
  password_hash    text,
  name             text NOT NULL,
  role             text NOT NULL DEFAULT 'DEVELOPER' CHECK (role IN ('ADMIN', 'DEVELOPER')),
  status           text NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED')),
  avatar_url       text,
  avatar_color     text NOT NULL DEFAULT '#6366f1',
  job_title        text,
  bio              text,
  timezone         text NOT NULL DEFAULT 'UTC',
  phone            text,
  location         text,
  github_handle    text,
  skills           text[] NOT NULL DEFAULT '{}',
  weekly_hours     integer NOT NULL DEFAULT 40 CHECK (weekly_hours BETWEEN 0 AND 80),
  preferences      jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_verified   boolean NOT NULL DEFAULT false,
  -- TOTP secret, encrypted at rest. Presence of totp_enabled_at means enrolled.
  totp_secret      text,
  totp_enabled_at  timestamptz,
  presence         text NOT NULL DEFAULT 'OFFLINE'
                     CHECK (presence IN ('ONLINE', 'AWAY', 'BUSY', 'OFFLINE')),
  last_seen_at     timestamptz,
  -- Brute-force state. Cleared on any successful authentication.
  failed_logins    integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  /*
   * Bumped on password change or forced sign-out; access tokens minted before
   * this instant are rejected even though they have not expired.
   *
   * Compared against the token's millisecond `ims` claim rather than the
   * second-resolution `iat`, so full precision is correct here.
   */
  tokens_valid_from timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Email is unique case-insensitively. A functional unique index is used rather
-- than citext so the schema needs no extension on either driver.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE INDEX users_role_status_idx ON users (role, status);
CREATE INDEX users_name_idx ON users (lower(name));

CREATE TABLE oauth_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('GOOGLE')),
  provider_user_id  text NOT NULL,
  email             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX oauth_accounts_user_idx ON oauth_accounts (user_id);

-- One row per refresh token. The token itself is never stored, only a SHA-256
-- hash, so a database leak cannot be replayed against the API.
CREATE TABLE sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      text NOT NULL UNIQUE,
  user_agent      text,
  ip_address      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  -- Set when this token was consumed by a rotation, pointing at its successor.
  -- A second use of a rotated token means the token leaked, which the API
  -- treats as compromise and responds to by revoking the whole family.
  replaced_by     uuid REFERENCES sessions(id) ON DELETE SET NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- Single-use tokens for password reset and email verification, also stored hashed.
CREATE TABLE auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('PASSWORD_RESET', 'EMAIL_VERIFY')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);

CREATE TABLE invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  role         text NOT NULL CHECK (role IN ('ADMIN', 'DEVELOPER')),
  name         text,
  token_hash   text NOT NULL UNIQUE,
  invited_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  project_ids  uuid[] NOT NULL DEFAULT '{}',
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_pending_email_key
  ON invitations (lower(email)) WHERE accepted_at IS NULL;

-- Append-only record of authentication attempts, keyed by email *and* IP so the
-- rate limiter can throttle either dimension independently.
CREATE TABLE login_attempts (
  id          bigserial PRIMARY KEY,
  email       text NOT NULL,
  ip_address  text,
  successful  boolean NOT NULL,
  reason      text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_time_idx ON login_attempts (lower(email), created_at DESC);
CREATE INDEX login_attempts_ip_time_idx ON login_attempts (ip_address, created_at DESC);

/* ---------------------------------------------------------------- projects */

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  key          text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'PLANNING'
                 CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED')),
  color        text NOT NULL DEFAULT '#6366f1',
  start_date   date,
  target_date  date,
  lead_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Monotonic counter behind task/issue references like XSP-128. Incremented
  -- inside the insert transaction so two concurrent creates cannot collide.
  task_counter integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  archived_at  timestamptz,
  CONSTRAINT projects_dates_ordered CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date)
);
CREATE UNIQUE INDEX projects_key_key ON projects (upper(key));
CREATE INDEX projects_status_idx ON projects (status);
CREATE INDEX projects_lead_idx ON projects (lead_id);

CREATE TABLE project_members (
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role  text NOT NULL DEFAULT 'MEMBER' CHECK (project_role IN ('LEAD', 'MEMBER', 'VIEWER')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);

/* ----------------------------------------------------------------- sprints */

CREATE TABLE sprints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name             text NOT NULL,
  goal             text,
  status           text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED')),
  start_date       date NOT NULL,
  end_date         date NOT NULL,
  capacity_points  integer CHECK (capacity_points IS NULL OR capacity_points >= 0),
  retrospective    text,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  CONSTRAINT sprints_dates_ordered CHECK (end_date > start_date)
);
CREATE INDEX sprints_project_idx ON sprints (project_id, status);
-- At most one sprint per project may be ACTIVE at a time.
CREATE UNIQUE INDEX sprints_one_active_per_project
  ON sprints (project_id) WHERE status = 'ACTIVE';

/* ------------------------------------------------------------------- tasks */

CREATE TABLE tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Per-project sequence number; `reference` is rendered as KEY-number.
  number         integer NOT NULL,
  title          text NOT NULL,
  description    text,
  type           text NOT NULL DEFAULT 'FEATURE'
                   CHECK (type IN ('FEATURE', 'BUG', 'CHORE', 'SPIKE', 'DOCS')),
  status         text NOT NULL DEFAULT 'TODO'
                   CHECK (status IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE')),
  priority       text NOT NULL DEFAULT 'MEDIUM'
                   CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  assignee_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  reporter_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  sprint_id      uuid REFERENCES sprints(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  estimate       integer CHECK (estimate IS NULL OR estimate IN (0, 1, 2, 3, 5, 8, 13, 21)),
  -- Fractional rank within a Kanban column, so a drag rewrites one row rather
  -- than renumbering the column.
  position       double precision NOT NULL DEFAULT 0,
  due_date       date,
  labels         text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  UNIQUE (project_id, number),
  -- A task cannot be its own parent. Deeper cycles are prevented in the service.
  CONSTRAINT tasks_no_self_parent CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status, position);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id, status);
CREATE INDEX tasks_sprint_idx ON tasks (sprint_id);
CREATE INDEX tasks_parent_idx ON tasks (parent_task_id);
CREATE INDEX tasks_due_idx ON tasks (due_date) WHERE status <> 'DONE';
CREATE INDEX tasks_labels_idx ON tasks USING gin (labels);
CREATE INDEX tasks_updated_idx ON tasks (updated_at DESC);

CREATE TABLE task_blockers (
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, blocked_by_id),
  CONSTRAINT task_blockers_not_self CHECK (task_id <> blocked_by_id)
);
CREATE INDEX task_blockers_blocked_by_idx ON task_blockers (blocked_by_id);

CREATE TABLE task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL,
  mentions    uuid[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  deleted_at  timestamptz
);
CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

CREATE TABLE time_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes     integer NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
  spent_on    date NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_logs_task_idx ON time_logs (task_id);
CREATE INDEX time_logs_user_date_idx ON time_logs (user_id, spent_on DESC);

/* ------------------------------------------------------------ issues & bugs */

CREATE TABLE issues (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number             integer NOT NULL,
  title              text NOT NULL,
  description        text NOT NULL,
  kind               text NOT NULL DEFAULT 'BUG'
                       CHECK (kind IN ('BUG', 'INCIDENT', 'VULNERABILITY', 'REGRESSION', 'QUESTION')),
  severity           text NOT NULL DEFAULT 'S3' CHECK (severity IN ('S1', 'S2', 'S3', 'S4')),
  status             text NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX')),
  assignee_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  reporter_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  steps_to_reproduce text,
  expected_behaviour text,
  actual_behaviour   text,
  environment        text,
  affected_version   text,
  labels             text[] NOT NULL DEFAULT '{}',
  linked_task_id     uuid REFERENCES tasks(id) ON DELETE SET NULL,
  resolution         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  UNIQUE (project_id, number)
);
CREATE INDEX issues_project_status_idx ON issues (project_id, status);
CREATE INDEX issues_assignee_idx ON issues (assignee_id, status);
CREATE INDEX issues_severity_idx ON issues (severity, status);
CREATE INDEX issues_updated_idx ON issues (updated_at DESC);

CREATE TABLE issue_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    uuid NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL,
  mentions    uuid[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  deleted_at  timestamptz
);
CREATE INDEX issue_comments_issue_idx ON issue_comments (issue_id, created_at);

/* ---------------------------------------------------------- git & deployment */

CREATE TABLE repositories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'GITHUB'
                    CHECK (provider IN ('GITHUB', 'GITLAB', 'BITBUCKET', 'OTHER')),
  name            text NOT NULL,
  full_name       text NOT NULL,
  url             text NOT NULL,
  default_branch  text NOT NULL DEFAULT 'main',
  is_private      boolean NOT NULL DEFAULT true,
  -- AES-256-GCM ciphertext of the provider token. Never selected by read paths;
  -- endpoints expose only `hasCredentials`.
  access_token_enc text,
  last_synced_at  timestamptz,
  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, full_name)
);
CREATE INDEX repositories_project_idx ON repositories (project_id);

CREATE TABLE repo_branches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id   uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name            text NOT NULL,
  is_default      boolean NOT NULL DEFAULT false,
  ahead           integer NOT NULL DEFAULT 0,
  behind          integer NOT NULL DEFAULT 0,
  last_commit_at  timestamptz,
  author          text,
  UNIQUE (repository_id, name)
);

CREATE TABLE repo_commits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id  uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha            text NOT NULL,
  message        text NOT NULL,
  author_name    text NOT NULL,
  author_email   text,
  committed_at   timestamptz NOT NULL,
  additions      integer NOT NULL DEFAULT 0,
  deletions      integer NOT NULL DEFAULT 0,
  url            text,
  UNIQUE (repository_id, sha)
);
CREATE INDEX repo_commits_repo_time_idx ON repo_commits (repository_id, committed_at DESC);

CREATE TABLE code_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_id    uuid REFERENCES repositories(id) ON DELETE SET NULL,
  number           integer NOT NULL,
  title            text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN', 'APPROVED', 'CHANGES_REQUESTED', 'MERGED', 'CLOSED')),
  author_id        uuid REFERENCES users(id) ON DELETE SET NULL,
  source_branch    text NOT NULL,
  target_branch    text NOT NULL DEFAULT 'main',
  external_number  integer,
  external_url     text,
  additions        integer NOT NULL DEFAULT 0,
  deletions        integer NOT NULL DEFAULT 0,
  changed_files    integer NOT NULL DEFAULT 0,
  linked_task_id   uuid REFERENCES tasks(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  merged_at        timestamptz,
  UNIQUE (project_id, number)
);
CREATE INDEX code_reviews_project_status_idx ON code_reviews (project_id, status);
CREATE INDEX code_reviews_author_idx ON code_reviews (author_id);
CREATE INDEX code_reviews_updated_idx ON code_reviews (updated_at DESC);

CREATE TABLE review_reviewers (
  review_id     uuid NOT NULL REFERENCES code_reviews(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict       text NOT NULL DEFAULT 'PENDING'
                  CHECK (verdict IN ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'COMMENTED')),
  responded_at  timestamptz,
  PRIMARY KEY (review_id, user_id)
);
CREATE INDEX review_reviewers_user_idx ON review_reviewers (user_id, verdict);

CREATE TABLE review_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES code_reviews(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL,
  file_path   text,
  line        integer CHECK (line IS NULL OR line > 0),
  parent_id   uuid REFERENCES review_comments(id) ON DELETE CASCADE,
  resolved    boolean NOT NULL DEFAULT false,
  mentions    uuid[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  deleted_at  timestamptz
);
CREATE INDEX review_comments_review_idx ON review_comments (review_id, created_at);

CREATE TABLE deployments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_id     uuid REFERENCES repositories(id) ON DELETE SET NULL,
  environment       text NOT NULL CHECK (environment IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION')),
  version           text NOT NULL,
  status            text NOT NULL DEFAULT 'QUEUED'
                      CHECK (status IN ('QUEUED', 'BUILDING', 'DEPLOYING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK')),
  commit_sha        text,
  branch            text,
  triggered_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Production deploys require an approver; enforced in the service layer.
  approved_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  notes             text,
  log_url           text,
  duration_seconds  integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);
CREATE INDEX deployments_project_idx ON deployments (project_id, created_at DESC);
CREATE INDEX deployments_env_status_idx ON deployments (environment, status);

/* ---------------------------------------------------------------- calendar */

CREATE TABLE calendar_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid REFERENCES projects(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  kind             text NOT NULL DEFAULT 'MEETING'
                     CHECK (kind IN ('MEETING', 'STANDUP', 'REVIEW', 'RETRO', 'RELEASE', 'DEADLINE', 'LEAVE', 'OTHER')),
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  all_day          boolean NOT NULL DEFAULT false,
  location         text,
  meeting_url      text,
  organizer_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  recurrence_rule  text,
  reminder_minutes integer CHECK (reminder_minutes IS NULL OR reminder_minutes >= 0),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_ordered CHECK (ends_at > starts_at)
);
-- Range queries on the calendar always filter by window, so lead on starts_at.
CREATE INDEX calendar_events_window_idx ON calendar_events (starts_at, ends_at);
CREATE INDEX calendar_events_project_idx ON calendar_events (project_id);

CREATE TABLE event_attendees (
  event_id   uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response   text NOT NULL DEFAULT 'PENDING'
               CHECK (response IN ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE')),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_attendees_user_idx ON event_attendees (user_id);

/* ---------------------------------------------------------- knowledge base */

CREATE TABLE kb_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid REFERENCES projects(id) ON DELETE CASCADE,
  title          text NOT NULL,
  content        text NOT NULL DEFAULT '',
  tags           text[] NOT NULL DEFAULT '{}',
  visibility     text NOT NULL DEFAULT 'TEAM' CHECK (visibility IN ('PRIVATE', 'TEAM', 'PUBLIC')),
  folder         text,
  icon           text,
  author_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  last_edited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Note titles are unique case-insensitively, because `[[wiki links]]` resolve by
-- title and an ambiguous target would make the graph non-deterministic.
CREATE UNIQUE INDEX kb_notes_title_key ON kb_notes (lower(title));
CREATE INDEX kb_notes_project_idx ON kb_notes (project_id);
CREATE INDEX kb_notes_tags_idx ON kb_notes USING gin (tags);
CREATE INDEX kb_notes_updated_idx ON kb_notes (updated_at DESC);

-- Materialised `[[wiki link]]` edges, rewritten whenever a note is saved. Kept
-- as a table rather than parsed on read so the graph view is a single query.
CREATE TABLE kb_links (
  source_id     uuid NOT NULL REFERENCES kb_notes(id) ON DELETE CASCADE,
  -- Null while the link points at a note that does not exist yet.
  target_id     uuid REFERENCES kb_notes(id) ON DELETE CASCADE,
  target_title  text NOT NULL,
  PRIMARY KEY (source_id, target_title)
);
CREATE INDEX kb_links_target_idx ON kb_links (target_id);

/* -------------------------------------------------------------------- chat */

CREATE TABLE channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  topic       text,
  kind        text NOT NULL DEFAULT 'PUBLIC' CHECK (kind IN ('PUBLIC', 'PRIVATE', 'DIRECT')),
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX channels_project_idx ON channels (project_id);
CREATE UNIQUE INDEX channels_name_key ON channels (lower(name)) WHERE kind <> 'DIRECT';

CREATE TABLE channel_members (
  channel_id   uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Watermark for the unread badge.
  last_read_at timestamptz,
  muted        boolean NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX channel_members_user_idx ON channel_members (user_id);

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL DEFAULT '',
  -- Client-generated id, unique per channel. Makes a retried send idempotent
  -- and lets the sender reconcile its optimistic bubble with the real row.
  client_id   text,
  parent_id   uuid REFERENCES messages(id) ON DELETE CASCADE,
  mentions    uuid[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);
-- Message history is read newest-first within a channel.
CREATE INDEX messages_channel_time_idx ON messages (channel_id, created_at DESC);
CREATE INDEX messages_parent_idx ON messages (parent_id);
CREATE UNIQUE INDEX messages_client_id_key ON messages (channel_id, client_id) WHERE client_id IS NOT NULL;

CREATE TABLE message_reactions (
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

/* ------------------------------------------------------------ files & docs */

CREATE TABLE files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid REFERENCES projects(id) ON DELETE CASCADE,
  name           text NOT NULL,
  -- Opaque storage key: an object path in Supabase Storage, or a filename on disk.
  storage_key    text NOT NULL,
  mime_type      text NOT NULL,
  size_bytes     bigint NOT NULL CHECK (size_bytes >= 0),
  checksum       text,
  folder         text,
  description    text,
  visibility     text NOT NULL DEFAULT 'TEAM' CHECK (visibility IN ('PRIVATE', 'TEAM', 'PUBLIC')),
  uploaded_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX files_project_idx ON files (project_id) WHERE deleted_at IS NULL;
CREATE INDEX files_uploader_idx ON files (uploaded_by);
CREATE INDEX files_created_idx ON files (created_at DESC);

CREATE TABLE message_attachments (
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id     uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, file_id)
);

CREATE TABLE task_attachments (
  task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_id  uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, file_id)
);

/* --------------------------------------------------- notifications & audit */

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- The bell badge counts unread rows for one user, so that is the covered path.
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_user_time_idx ON notifications (user_id, created_at DESC);

-- Product-visible activity feed.
CREATE TABLE activity_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  entity_label  text,
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_time_idx ON activity_log (created_at DESC);
CREATE INDEX activity_log_project_time_idx ON activity_log (project_id, created_at DESC);
CREATE INDEX activity_log_actor_time_idx ON activity_log (actor_id, created_at DESC);
CREATE INDEX activity_log_entity_idx ON activity_log (entity_type, entity_id);

-- Security audit trail: authentication, authorization denials, role changes and
-- privileged writes. Separate from activity_log because it is append-only,
-- retained longer, and readable only with `audit:read`.
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  resource     text,
  resource_id  text,
  ip_address   text,
  user_agent   text,
  outcome      text NOT NULL DEFAULT 'SUCCESS' CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED')),
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_time_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_action_idx ON audit_log (action, created_at DESC);

/* -------------------------------------------------------------- maintenance */

-- `updated_at` is maintained by the database rather than by each UPDATE
-- statement, so no write path can forget it and stale-read protection stays
-- trustworthy.
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER projects_touch BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER issues_touch BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER code_reviews_touch BEFORE UPDATE ON code_reviews
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER calendar_events_touch BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER kb_notes_touch BEFORE UPDATE ON kb_notes
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Stamp/clear completion timestamps from the status transition itself, so
-- cycle-time reporting cannot disagree with the board.
CREATE OR REPLACE FUNCTION stamp_task_completion() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'DONE' AND (OLD.status IS DISTINCT FROM 'DONE') THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'DONE' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_stamp_completion BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION stamp_task_completion();

CREATE OR REPLACE FUNCTION stamp_issue_resolution() RETURNS trigger AS $$
BEGIN
  IF NEW.status IN ('RESOLVED', 'CLOSED', 'WONT_FIX')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('RESOLVED', 'CLOSED', 'WONT_FIX')) THEN
    NEW.resolved_at = now();
  ELSIF NEW.status NOT IN ('RESOLVED', 'CLOSED', 'WONT_FIX') THEN
    NEW.resolved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issues_stamp_resolution BEFORE INSERT OR UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION stamp_issue_resolution();

/* ------------------------------------------------------------- text search */

-- Search indexes over the fields the global search box queries. Expression
-- indexes keep them in step with the rows automatically, with no extra column
-- to maintain or backfill.
CREATE INDEX tasks_search_idx ON tasks
  USING gin (to_tsvector('english', title || ' ' || coalesce(description, '')));
CREATE INDEX issues_search_idx ON issues
  USING gin (to_tsvector('english', title || ' ' || description));
CREATE INDEX kb_notes_search_idx ON kb_notes
  USING gin (to_tsvector('english', title || ' ' || content));
CREATE INDEX projects_search_idx ON projects
  USING gin (to_tsvector('english', name || ' ' || coalesce(description, '')));
