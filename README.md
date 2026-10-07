# XenoSpace

Project management and development platform for engineering teams, with two
roles: **Team Lead** (admin) and **Developer**.

```
apps/api         Express 5 + TypeScript REST API, Socket.IO realtime
apps/web         React 19 SPA (Vite 8, Tailwind 4, TanStack Query)
packages/shared  Zod schemas, RBAC matrix and types used by both sides
```

The shared package is the contract: the API validates requests with the same
Zod schemas the forms use, and the RBAC matrix that guards routes is the one
that builds the navigation.

## Run it locally

Requires Node 22.9 or newer. No database or Redis needed locally — the API uses
an in-process Postgres (PGlite) and an in-memory cache until you configure the
real ones.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # then fill the four secrets: openssl rand -hex 32
npm run db:seed                          # demo workspace
npm run dev                              # API on :4000, web on :5173
```

The local database allows one process at a time. If you see "already in use by
another process", an API is still running — stop it before starting another
or running `db:seed` / `db:reset`.

Open http://localhost:5173. Every demo account uses the password
`XenoSpace-Demo-2026!`:

| Role       | Email                |
| ---------- | -------------------- |
| Team Lead  | ava@xenospace.dev    |
| Team Lead  | rhys@xenospace.dev   |
| Developer  | mina@xenospace.dev   |
| Developer  | diego@xenospace.dev  |

To start from an empty workspace instead, skip the seed: the first account to
register becomes the Team Lead, and everyone after is a Developer unless
invited with another role.

## Who can sign in

Three settings in `apps/api/.env` decide access:

- `ADMIN_EMAILS` — the team lead address(es), and the only ones. Everyone else
  is a developer and nobody else can be promoted. The address gets the role
  only once Google (or an invitation) has proved the inbox.
- `ACCESS=invite_only` — only people a team lead adds under **Team Members →
  Add a member** can get in; other Google accounts are turned away.
- `PASSWORD_LOGIN=false` — Google is the only way to sign in; every password
  route is refused by the API, not just hidden.

With all three set, the lead adds a developer's Gmail address (and their
projects), and the developer clicks **Continue with Google** on the login page.
The demo accounts use passwords, so they cannot sign in in this mode.

## Connect Supabase

1. Supabase → **Project Settings → Database → Connection string → URI**. Use
   the **session pooler (port 5432)**, not the transaction pooler (6543): the
   API holds transactions open, which the transaction pooler does not support.
2. Set `DATABASE_URL` in `apps/api/.env`.
3. `npm run db:migrate` — the same SQL migrations run on PGlite and Postgres.
4. Optional: set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to store
   uploads in Supabase Storage instead of local disk.

The API talks to Supabase as a plain Postgres database with its own auth. It
does not use Supabase Auth or row-level security; authorization is enforced in
the API (see below).

## Production checklist

The API refuses to start in production unless these are set:

- `DATABASE_URL` and `REDIS_URL` (Redis carries rate limits and cross-instance
  realtime; per-process limits would multiply by instance count).
- Four **distinct** secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
  `ENCRYPTION_KEY`, `CSRF_SECRET`.
- `COOKIE_SECURE=true`.

Also set `TRUST_PROXY` to your real proxy hop count — a wrong value lets
clients spoof their IP and evade rate limits — and serve web and API from the
same registrable domain (`app.example.com` + `api.example.com`), or set
`COOKIE_SAMESITE=none` with HTTPS for a genuinely cross-site deployment.

```bash
npm run build
npm run start --workspace=@xenospace/api   # serve apps/web/dist from any static host or CDN
```

With several API replicas, run migrations as a release step rather than
relying on migrate-on-boot. This runs from the built output and needs no dev
tooling:

```bash
npm run db:migrate:prod --workspace=@xenospace/api
```

## Security model

- **Passwords:** Argon2id (OWASP parameters), 12-character minimum, transparent
  rehash when parameters are raised. Unknown emails cost the same time as real
  ones, so login timing does not reveal which accounts exist.
- **Sessions:** 15-minute access JWTs held in memory only. Refresh tokens are
  httpOnly cookies, stored hashed, single-use and rotated. Replaying a rotated
  token is treated as theft and ends every session for that user.
- **CSRF:** double-submit token on the cookie-authenticated endpoints.
- **Authorization:** permission-based RBAC, plus project-membership scoping in
  every query. A developer requesting another project's data gets a 404, not a
  403, so ids cannot be enumerated.
- **Lockout and rate limits:** per account and per IP; failures are recorded
  durably and shown in the Security Audit page.
- **Uploads:** type and size validated before storage, server-generated storage
  keys, and served as attachments under a sandboxed CSP so an uploaded file
  cannot run script in the app's origin.
- **Secrets at rest:** repository tokens and TOTP secrets use AES-256-GCM and
  are never returned by the API.

## Tests

```bash
npm test          # 67 API tests: auth, access, sessions, authorization, schema rules
npm run typecheck
```

The suites cover vertical and horizontal privilege escalation, mass
assignment, SQL-injection payloads, forged and `alg: none` tokens, lockout,
refresh rotation and reuse, multi-tab sessions and cookie attributes.

## Not built yet

- **Email delivery.** Invitations and password resets are created and logged,
  and the invite link is shown to the Team Lead in development, but no mail
  transport is connected. Plug one in where the routes log the link.
- **Two-factor enrolment UI.** TOTP is enforced at sign-in for any account that
  has it enabled, but there is no screen to enrol yet.
- **Live git sync.** Repositories, branches and commits are stored and shown,
  but nothing pulls from GitHub yet; the access token is stored for that.
- **Frontend tests.** The UI was verified by driving it in a real browser, not
  by an automated suite.
