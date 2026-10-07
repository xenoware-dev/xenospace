-- Session families.
--
-- Refresh rotation creates a new `sessions` row on every refresh. Access tokens
-- were bound to a single row, so rotating revoked the row an unexpired access
-- token pointed at: any refresh killed every in-flight token, and with two tabs
-- open, one tab's refresh signed the other out.
--
-- A family is every row descended from one sign-in. Access tokens now carry the
-- family id, and a token is valid while its family has a live row. Logout,
-- revocation and reuse detection all still end the family as a whole.

ALTER TABLE sessions ADD COLUMN family_id uuid;
UPDATE sessions SET family_id = id WHERE family_id IS NULL;
ALTER TABLE sessions ALTER COLUMN family_id SET NOT NULL;

CREATE INDEX sessions_family_live_idx ON sessions (family_id) WHERE revoked_at IS NULL;
