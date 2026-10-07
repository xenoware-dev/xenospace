-- Close Supabase's auto-generated Data API over these tables.
--
-- Supabase publishes the `public` schema through PostgREST to the `anon` and
-- `authenticated` roles, reachable with the project's publishable key — which
-- is designed to be public. Without this, anyone holding that key could read
-- password hashes and sessions or write any row directly, bypassing the API's
-- authorization entirely.
--
-- The API connects as the tables' owner, which row-level security does not
-- restrict (no FORCE), so enabling RLS with no policies denies every Data API
-- role while leaving the API untouched. Grants are revoked as well, so access
-- stays closed even if a policy is ever added by mistake.
--
-- A table added by a later migration must enable RLS itself; the default
-- privileges below already keep the public roles off it.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  -- The roles only exist on Supabase; plain Postgres and PGlite skip this.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END
$$;
