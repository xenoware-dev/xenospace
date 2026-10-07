-- GitHub sync: repository sync state, pull requests as code reviews, and the
-- links from commits, branches and pull requests to the tasks they mention.

-- Sync bookkeeping. `sync_started_at` is a lease, so two API instances (or the
-- timer and a "Sync now" click) cannot sync the same repository at once.
ALTER TABLE repositories
  ADD COLUMN last_sync_error text,
  ADD COLUMN sync_started_at timestamptz;

-- A pull request whose GitHub author has no XenoSpace account still shows who
-- opened it, rather than "Former member".
ALTER TABLE code_reviews
  ADD COLUMN external_author text,
  ADD COLUMN external_author_avatar text;

-- One code review per pull request per repository; the sync upserts on this.
CREATE UNIQUE INDEX code_reviews_repo_external_key
  ON code_reviews (repository_id, external_number)
  WHERE repository_id IS NOT NULL AND external_number IS NOT NULL;

-- Matching a GitHub login to a member is a case-insensitive lookup.
CREATE INDEX users_github_handle_idx ON users (lower(github_handle)) WHERE github_handle IS NOT NULL;

CREATE TABLE task_git_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  repository_id  uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('COMMIT', 'PULL_REQUEST', 'BRANCH')),
  -- The commit SHA, pull request number or branch name.
  ref            text NOT NULL,
  title          text NOT NULL,
  url            text,
  -- Pull request state (OPEN / MERGED / CLOSED); null for commits and branches.
  state          text,
  author         text,
  occurred_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, repository_id, kind, ref)
);
CREATE INDEX task_git_links_task_idx ON task_git_links (task_id, occurred_at DESC);

-- Same rule as every other table: closed to Supabase's Data API (see 004).
ALTER TABLE task_git_links ENABLE ROW LEVEL SECURITY;
