import { realpathSync } from 'node:fs';
import { reconcileAdminRoles } from '../auth/adminPolicy.js';
import { fileURLToPath } from 'node:url';
import { closeDb, getDb, type Queryable } from './index.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../auth/password.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

/**
 * Development seed.
 *
 * Builds a workspace that exercises every screen: two roles, several projects,
 * a running sprint with a believable burndown, issues at each severity, reviews
 * mid-discussion, deployment history, a linked knowledge base and chat with
 * history. Deterministic, so the UI looks the same on every reset.
 */

/** Shared password for every seeded account, printed at the end. */
const DEMO_PASSWORD = 'XenoSpace-Demo-2026!';

/** Deterministic pseudo-random, so seeded data does not churn between runs. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}
const rand = makeRandom(20_260_106);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const pickSome = <T>(items: readonly T[], n: number): T[] =>
  [...items].sort(() => rand() - 0.5).slice(0, n);

/** Days offset from today, as an ISO date. */
const dayOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const hourOffset = (hours: number): string =>
  new Date(Date.now() + hours * 3_600_000).toISOString();

const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];

interface SeedUser {
  name: string; email: string; role: 'ADMIN' | 'DEVELOPER'; jobTitle: string;
  skills: string[]; location: string; github: string;
}

const USERS: SeedUser[] = [
  { name: 'Ava Okonkwo', email: 'ava@xenospace.dev', role: 'ADMIN', jobTitle: 'Engineering Lead', skills: ['Architecture', 'TypeScript', 'Postgres', 'Mentoring'], location: 'Lagos, NG', github: 'avaokonkwo' },
  { name: 'Rhys Calder', email: 'rhys@xenospace.dev', role: 'ADMIN', jobTitle: 'Delivery Lead', skills: ['Planning', 'Risk', 'Stakeholders'], location: 'Edinburgh, UK', github: 'rhyscalder' },
  { name: 'Mina Takahashi', email: 'mina@xenospace.dev', role: 'DEVELOPER', jobTitle: 'Senior Frontend Engineer', skills: ['React', 'TypeScript', 'Accessibility', 'CSS'], location: 'Osaka, JP', github: 'minatk' },
  { name: 'Diego Ferreira', email: 'diego@xenospace.dev', role: 'DEVELOPER', jobTitle: 'Backend Engineer', skills: ['Node.js', 'Postgres', 'Redis', 'APIs'], location: 'São Paulo, BR', github: 'dferreira' },
  { name: 'Priya Raman', email: 'priya@xenospace.dev', role: 'DEVELOPER', jobTitle: 'Platform Engineer', skills: ['Kubernetes', 'Terraform', 'CI/CD', 'Observability'], location: 'Bengaluru, IN', github: 'priyaraman' },
  { name: 'Tomas Novak', email: 'tomas@xenospace.dev', role: 'DEVELOPER', jobTitle: 'Full-stack Engineer', skills: ['React', 'Node.js', 'GraphQL'], location: 'Brno, CZ', github: 'tnovak' },
  { name: 'Sade Hughes', email: 'sade@xenospace.dev', role: 'DEVELOPER', jobTitle: 'QA Engineer', skills: ['Playwright', 'Test strategy', 'Security testing'], location: 'Manchester, UK', github: 'sadehughes' },
];

export async function seed(): Promise<{ users: number; projects: number; tasks: number }> {
  if (isProd) throw new Error('Refusing to seed a production database.');

  const db = await getDb();
  await migrate();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  return db.transaction(async (tx) => {
    // Idempotent: a reseed replaces the demo workspace rather than stacking on it.
    await tx.query(`DELETE FROM users WHERE email LIKE '%@xenospace.dev'`);
    await tx.query(`DELETE FROM projects WHERE key IN ('XSP', 'ORB', 'ATL')`);
    await tx.query(`DELETE FROM channels WHERE lower(name) IN ('general', 'engineering', 'incidents', 'releases')`);
    await tx.query(`DELETE FROM kb_notes WHERE title LIKE 'XenoSpace%' OR folder IN ('Engineering', 'Runbooks', 'Onboarding', 'Architecture')`);

    /* ------------------------------------------------------------- users */
    const userIds: Record<string, string> = {};
    for (const [i, u] of USERS.entries()) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO users (email, name, password_hash, role, status, job_title, skills,
                            location, github_handle, avatar_color, email_verified, timezone,
                            weekly_hours, presence, last_seen_at, bio)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6,$7,$8,$9,true,$10,$11,$12,now() - ($13 || ' minutes')::interval,$14)
         RETURNING id`,
        [
          u.email, u.name, passwordHash, u.role, u.jobTitle, u.skills, u.location, u.github,
          AVATAR_COLORS[i % AVATAR_COLORS.length], 'UTC', 40,
          i < 3 ? 'ONLINE' : i < 5 ? 'AWAY' : 'OFFLINE',
          String(i * 17),
          `${u.jobTitle} working on ${u.skills[0]} and ${u.skills[1]}.`,
        ],
      );
      userIds[u.email] = rows[0]!.id;
    }

    const ava = userIds['ava@xenospace.dev']!;
    const rhys = userIds['rhys@xenospace.dev']!;
    const devIds = USERS.filter((u) => u.role === 'DEVELOPER').map((u) => userIds[u.email]!);
    const allIds = Object.values(userIds);

    /* ---------------------------------------------------------- projects */
    const projects = [
      { name: 'XenoSpace Platform', key: 'XSP', color: '#6366f1', status: 'ACTIVE', lead: ava, desc: 'The core project-management platform: workspaces, boards, sprints and reporting.', start: -90, target: 60 },
      { name: 'Orbit Mobile', key: 'ORB', color: '#8b5cf6', status: 'ACTIVE', lead: rhys, desc: 'React Native companion app with offline-first task capture.', start: -45, target: 90 },
      { name: 'Atlas Data Pipeline', key: 'ATL', color: '#14b8a6', status: 'PLANNING', lead: ava, desc: 'Event ingestion and warehouse sync feeding the analytics surface.', start: -10, target: 120 },
    ] as const;

    const projectIds: Record<string, string> = {};
    const projectMembers: Record<string, string[]> = {};
    for (const p of projects) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO projects (name, key, description, status, color, start_date, target_date, lead_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
        [p.name, p.key, p.desc, p.status, p.color, dayOffset(p.start), dayOffset(p.target), p.lead],
      );
      projectIds[p.key] = rows[0]!.id;

      /*
       * Membership is deliberate rather than random. Both leads are on every
       * project; XSP carries the whole team so the main board is populated,
       * while ORB and ATL take subsets so project scoping is actually
       * observable in the UI.
       */
      const members = new Set<string>([p.lead, ava, rhys]);
      const devsFor = p.key === 'XSP' ? devIds : p.key === 'ORB' ? devIds.slice(0, 3) : devIds.slice(3);
      for (const id of devsFor) members.add(id);
      for (const userId of members) {
        await tx.query(
          `INSERT INTO project_members (project_id, user_id, project_role)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [projectIds[p.key], userId, userId === p.lead ? 'LEAD' : 'MEMBER'],
        );
      }
      projectMembers[p.key] = [...members];
    }

    /**
     * Assignable developers for a project. A task may only be assigned to a
     * project member — the API enforces this on create, so seeded data that
     * broke the invariant would make the board and the dashboards disagree.
     */
    const assignableIn = (key: string): string[] =>
      (projectMembers[key] ?? []).filter((id) => devIds.includes(id));

    const xsp = projectIds.XSP!;
    const orb = projectIds.ORB!;

    /* ----------------------------------------------------------- sprints */
    const { rows: sprint3 } = await tx.query<{ id: string }>(
      `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, capacity_points, created_by, started_at)
       VALUES ($1,'Sprint 24.3','Ship the Kanban board and sprint reporting end to end.','ACTIVE',$2,$3,42,$4, now() - interval '8 days')
       RETURNING id`,
      [xsp, dayOffset(-8), dayOffset(6), ava],
    );
    const activeSprint = sprint3[0]!.id;

    await tx.query(
      `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, capacity_points, created_by, completed_at, retrospective)
       VALUES ($1,'Sprint 24.2','Authentication, RBAC and the project shell.','COMPLETED',$2,$3,40,$4, now() - interval '9 days',
               'Went well: auth landed early and the RBAC matrix held up under review. Watch: estimates on the board work were optimistic by about a third.')`,
      [xsp, dayOffset(-22), dayOffset(-9), ava],
    );
    const { rows: nextSprint } = await tx.query<{ id: string }>(
      `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, capacity_points, created_by)
       VALUES ($1,'Sprint 24.4','Knowledge base graph and deployment pipeline.','PLANNED',$2,$3,44,$4) RETURNING id`,
      [xsp, dayOffset(7), dayOffset(21), ava],
    );
    await tx.query(
      `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, capacity_points, created_by, started_at)
       VALUES ($1,'Orbit Sprint 6','Offline sync conflict resolution.','ACTIVE',$2,$3,30,$4, now() - interval '4 days')`,
      [orb, dayOffset(-4), dayOffset(10), rhys],
    );

    /* ------------------------------------------------------------- tasks */
    const taskSeeds = [
      { t: 'Kanban board drag and drop with fractional ranking', s: 'DONE', p: 'HIGH', e: 8, ty: 'FEATURE', d: -3, done: -3 },
      { t: 'Server-side task transition validation', s: 'DONE', p: 'URGENT', e: 5, ty: 'FEATURE', d: -5, done: -5 },
      { t: 'Sprint burndown derived from completion history', s: 'IN_REVIEW', p: 'HIGH', e: 5, ty: 'FEATURE', d: 2 },
      { t: 'Refresh-token rotation with reuse detection', s: 'DONE', p: 'URGENT', e: 8, ty: 'FEATURE', d: -6, done: -6 },
      { t: 'Developer dashboard analytics queries', s: 'IN_PROGRESS', p: 'HIGH', e: 5, ty: 'FEATURE', d: 3 },
      { t: 'Knowledge base wiki-link graph view', s: 'IN_PROGRESS', p: 'MEDIUM', e: 13, ty: 'FEATURE', d: 5 },
      { t: 'Virtualise the task list for large projects', s: 'TODO', p: 'MEDIUM', e: 5, ty: 'CHORE', d: 8 },
      { t: 'Keyboard shortcuts and command palette', s: 'TODO', p: 'MEDIUM', e: 8, ty: 'FEATURE', d: 10 },
      { t: 'Audit log viewer for team leads', s: 'TODO', p: 'HIGH', e: 3, ty: 'FEATURE', d: 4 },
      { t: 'Socket.IO presence and typing indicators', s: 'IN_REVIEW', p: 'MEDIUM', e: 5, ty: 'FEATURE', d: 1 },
      { t: 'Investigate slow project list query', s: 'BLOCKED', p: 'HIGH', e: 3, ty: 'SPIKE', d: -1 },
      { t: 'Document the RBAC permission matrix', s: 'TODO', p: 'LOW', e: 2, ty: 'DOCS', d: 12 },
      { t: 'File upload MIME and size hardening', s: 'DONE', p: 'HIGH', e: 3, ty: 'CHORE', d: -2, done: -2 },
      { t: 'Reduce dashboard first paint below 1s', s: 'TODO', p: 'MEDIUM', e: 8, ty: 'CHORE', d: 15 },
      { t: 'Empty states for every list view', s: 'TODO', p: 'LOW', e: 3, ty: 'FEATURE', d: 18 },
      { t: 'Backlog grooming automation', s: 'BACKLOG', p: 'LOW', e: 5, ty: 'FEATURE', d: null },
      { t: 'Multi-workspace tenancy spike', s: 'BACKLOG', p: 'MEDIUM', e: 13, ty: 'SPIKE', d: null },
    ] as const;

    let taskCount = 0;
    const createdTasks: Array<{ id: string; status: string; title: string }> = [];
    for (const [i, t] of taskSeeds.entries()) {
      const { rows: counter } = await tx.query<{ task_counter: number }>(
        `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
        [xsp],
      );
      const assignee = t.s === 'BACKLOG' ? null : pick(assignableIn('XSP'));
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO tasks (project_id, number, title, description, type, status, priority,
                            assignee_id, reporter_id, sprint_id, estimate, position, due_date, labels,
                            created_at, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
                 now() - ($15 || ' days')::interval, $16)
         RETURNING id`,
        [
          xsp, counter[0]!.task_counter, t.t,
          `## Context\n\n${t.t}.\n\n## Acceptance criteria\n\n- [ ] Behaviour verified against the spec\n- [ ] Covered by tests\n- [ ] Reviewed by a second engineer\n`,
          t.ty, t.s, t.p, assignee, pick([ava, rhys]),
          t.s === 'BACKLOG' ? null : activeSprint,
          t.e, (i + 1) * 1000, t.d === null ? null : dayOffset(t.d),
          pickSome(['board', 'security', 'perf', 'ux', 'api', 'infra'], 2),
          String(14 - Math.floor(i / 2)),
          'done' in t && t.done !== undefined ? hourOffset(t.done * 24) : null,
        ],
      );
      createdTasks.push({ id: rows[0]!.id, status: t.s, title: t.t });
      taskCount++;
    }

    // A blocked task needs something blocking it, or the state is a lie.
    const blocked = createdTasks.find((t) => t.status === 'BLOCKED');
    const blocker = createdTasks.find((t) => t.status === 'IN_PROGRESS');
    if (blocked && blocker) {
      await tx.query(
        `INSERT INTO task_blockers (task_id, blocked_by_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [blocked.id, blocker.id],
      );
    }

    // Orbit tasks, so the project switcher has somewhere to go.
    for (const [i, t] of ([
      { t: 'Offline queue with conflict resolution', s: 'IN_PROGRESS', p: 'URGENT', e: 13 },
      { t: 'Biometric unlock on iOS and Android', s: 'TODO', p: 'MEDIUM', e: 8 },
      { t: 'Push notification delivery receipts', s: 'TODO', p: 'HIGH', e: 5 },
      { t: 'Reduce cold start to under two seconds', s: 'DONE', p: 'HIGH', e: 8 },
    ] as const).entries()) {
      const { rows: counter } = await tx.query<{ task_counter: number }>(
        `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
        [orb],
      );
      await tx.query(
        `INSERT INTO tasks (project_id, number, title, description, type, status, priority,
                            assignee_id, reporter_id, estimate, position, due_date, labels, completed_at)
         VALUES ($1,$2,$3,$4,'FEATURE',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          orb, counter[0]!.task_counter, t.t, `${t.t}.`, t.s, t.p,
          pick(assignableIn('ORB')), rhys, t.e, (i + 1) * 1000, dayOffset(5 + i * 4),
          ['mobile'], t.s === 'DONE' ? hourOffset(-48) : null,
        ],
      );
      taskCount++;
    }

    /* -------------------------------------------------------- time logs */
    for (const task of createdTasks.filter((t) => t.status === 'DONE' || t.status === 'IN_PROGRESS')) {
      for (let d = 1; d <= 3; d++) {
        await tx.query(
          `INSERT INTO time_logs (task_id, user_id, minutes, spent_on, note)
           VALUES ($1,$2,$3,$4,$5)`,
          [task.id, pick(assignableIn('XSP')), 60 + Math.floor(rand() * 240), dayOffset(-d), 'Implementation and tests'],
        );
      }
    }

    /* ----------------------------------------------------------- comments */
    for (const task of createdTasks.slice(0, 6)) {
      for (const body of [
        'Picked this up — the ranking approach from the spec works, writing it up now.',
        'One thought: should we debounce the reorder request so a fast drag does not fire three writes?',
        'Good catch. Batched it behind a 150ms trailing edge and added a test for the race.',
      ]) {
        await tx.query(
          `INSERT INTO task_comments (task_id, author_id, body, created_at)
           VALUES ($1,$2,$3, now() - ($4 || ' hours')::interval)`,
          [task.id, pick(allIds), body, String(Math.floor(rand() * 72))],
        );
      }
    }

    /* ------------------------------------------------------------- issues */
    const issueSeeds = [
      { t: 'Board drag drops the card on a slow connection', k: 'BUG', sev: 'S2', st: 'IN_PROGRESS' },
      { t: 'Session expires without warning mid-form', k: 'BUG', sev: 'S2', st: 'TRIAGED' },
      { t: 'Production deploy rolled back after migration timeout', k: 'INCIDENT', sev: 'S1', st: 'OPEN' },
      { t: 'Stored XSS possible via uploaded SVG', k: 'VULNERABILITY', sev: 'S1', st: 'RESOLVED' },
      { t: 'Sprint burndown off by one on the final day', k: 'BUG', sev: 'S3', st: 'OPEN' },
      { t: 'Avatar colours repeat across the team list', k: 'BUG', sev: 'S4', st: 'OPEN' },
      { t: 'Notification badge sticks after marking all read', k: 'REGRESSION', sev: 'S3', st: 'TRIAGED' },
      { t: 'Does the audit log retain denied attempts?', k: 'QUESTION', sev: 'S4', st: 'CLOSED' },
    ] as const;

    for (const issue of issueSeeds) {
      const { rows: counter } = await tx.query<{ task_counter: number }>(
        `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
        [xsp],
      );
      await tx.query(
        `INSERT INTO issues (project_id, number, title, description, kind, severity, status,
                             assignee_id, reporter_id, steps_to_reproduce, expected_behaviour,
                             actual_behaviour, environment, affected_version, labels, resolution,
                             created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                 now() - ($17 || ' days')::interval)`,
        [
          xsp, counter[0]!.task_counter, issue.t,
          `Reported while testing ${pick(['the board', 'the sprint view', 'the deploy pipeline', 'the chat panel'])}. Reproducible on the current main build.`,
          issue.k, issue.sev, issue.st,
          issue.st === 'OPEN' ? null : pick(assignableIn('XSP')), pick(projectMembers.XSP ?? allIds),
          '1. Open the board\n2. Drag a card between columns\n3. Observe the network tab',
          'The card settles in the destination column and the write succeeds.',
          'The card snaps back and the request returns 409.',
          `Chrome 142 / macOS 15`, '1.4.2',
          pickSome(['board', 'security', 'regression', 'infra'], 2),
          ['RESOLVED', 'CLOSED'].includes(issue.st)
            ? 'Fixed by serving uploads with Content-Disposition: attachment and a sandboxed CSP.'
            : null,
          String(Math.floor(rand() * 20)),
        ],
      );
    }

    /* ------------------------------------------------------ repositories */
    const { rows: repo } = await tx.query<{ id: string }>(
      `INSERT INTO repositories (project_id, provider, name, full_name, url, default_branch, is_private, created_by, last_synced_at)
       VALUES ($1,'GITHUB','xenospace','xenoware/xenospace','https://github.com/xenoware/xenospace','main',true,$2, now() - interval '12 minutes')
       RETURNING id`,
      [xsp, ava],
    );
    const repoId = repo[0]!.id;
    await tx.query(
      `INSERT INTO repositories (project_id, provider, name, full_name, url, default_branch, is_private, created_by, last_synced_at)
       VALUES ($1,'GITHUB','orbit-mobile','xenoware/orbit-mobile','https://github.com/xenoware/orbit-mobile','main',true,$2, now() - interval '3 hours')`,
      [orb, rhys],
    );

    for (const b of [
      { n: 'main', d: true, a: 0, be: 0 },
      { n: 'feat/kanban-dnd', d: false, a: 12, be: 2 },
      { n: 'feat/kb-graph', d: false, a: 34, be: 0 },
      { n: 'fix/session-expiry', d: false, a: 3, be: 5 },
    ]) {
      await tx.query(
        `INSERT INTO repo_branches (repository_id, name, is_default, ahead, behind, last_commit_at, author)
         VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' hours')::interval, $7)`,
        [repoId, b.n, b.d, b.a, b.be, String(Math.floor(rand() * 72)), pick(USERS).name],
      );
    }

    const commitMessages = [
      'feat(board): fractional ranking for kanban reorder',
      'fix(auth): commit failure bookkeeping outside the transaction',
      'refactor(db): single adapter over pg and pglite',
      'test(security): cover horizontal privilege escalation',
      'feat(kb): materialise wiki links on save',
      'perf(projects): collapse rollups into one query',
      'chore(deps): move to express 5 for the patched router',
      'fix(files): serve uploads with a sandboxed CSP',
      'feat(realtime): authorize socket room joins server-side',
      'docs(rbac): describe the ownership-scoped permissions',
      'fix(sprint): correct the final day of the burndown',
      'feat(notifications): respect per-kind preferences',
    ];
    for (const [i, message] of commitMessages.entries()) {
      await tx.query(
        `INSERT INTO repo_commits (repository_id, sha, message, author_name, author_email,
                                   committed_at, additions, deletions, url)
         VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' hours')::interval, $7,$8,$9)`,
        [
          repoId,
          Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join(''),
          message, pick(USERS).name, pick(USERS).email,
          String(i * 7 + 2), 20 + Math.floor(rand() * 400), Math.floor(rand() * 150),
          'https://github.com/xenoware/xenospace/commit/HEAD',
        ],
      );
    }

    /* ------------------------------------------------------- code reviews */
    const reviewSeeds = [
      { t: 'Kanban drag and drop with fractional ranking', b: 'feat/kanban-dnd', st: 'APPROVED', add: 412, del: 88, f: 14 },
      { t: 'Knowledge base graph view', b: 'feat/kb-graph', st: 'OPEN', add: 688, del: 32, f: 21 },
      { t: 'Fix session expiry handling', b: 'fix/session-expiry', st: 'CHANGES_REQUESTED', add: 54, del: 61, f: 5 },
      { t: 'Harden file upload handling', b: 'chore/upload-hardening', st: 'MERGED', add: 143, del: 27, f: 8 },
    ] as const;

    for (const r of reviewSeeds) {
      const { rows: counter } = await tx.query<{ task_counter: number }>(
        `UPDATE projects SET task_counter = task_counter + 1 WHERE id = $1 RETURNING task_counter`,
        [xsp],
      );
      const author = pick(assignableIn('XSP'));
      const { rows: created } = await tx.query<{ id: string }>(
        `INSERT INTO code_reviews (project_id, repository_id, number, title, description, status,
                                   author_id, source_branch, target_branch, external_number,
                                   external_url, additions, deletions, changed_files, created_at, merged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'main',$9,$10,$11,$12,$13,
                 now() - ($14 || ' days')::interval, $15)
         RETURNING id`,
        [
          xsp, repoId, counter[0]!.task_counter, r.t,
          `### What\n\n${r.t}.\n\n### Why\n\nCloses the gap identified in sprint planning.\n\n### Testing\n\nUnit and integration suites pass; manually verified on the board.`,
          r.st, author, r.b, counter[0]!.task_counter,
          'https://github.com/xenoware/xenospace/pull/1', r.add, r.del, r.f,
          String(Math.floor(rand() * 8) + 1),
          r.st === 'MERGED' ? hourOffset(-30) : null,
        ],
      );
      const reviewId = created[0]!.id;

      for (const reviewer of pickSome((projectMembers.XSP ?? allIds).filter((id) => id !== author), 2)) {
        const verdict = r.st === 'APPROVED' || r.st === 'MERGED'
          ? 'APPROVED'
          : r.st === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'PENDING';
        await tx.query(
          `INSERT INTO review_reviewers (review_id, user_id, verdict, responded_at)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [reviewId, reviewer, verdict, verdict === 'PENDING' ? null : hourOffset(-12)],
        );
      }

      for (const c of [
        { body: 'The ranking maths is clear. One nit: extract the midpoint helper so the board and the API share it.', file: 'src/modules/tasks/tasks.service.ts', line: 142, resolved: true },
        { body: 'Worth a comment explaining why the position is a float rather than an int — it will read as odd otherwise.', file: 'src/db/migrations/001_init.sql', line: 218, resolved: false },
        { body: 'Confirmed this handles the concurrent-drag case. Nice work.', file: null, line: null, resolved: false },
      ]) {
        await tx.query(
          `INSERT INTO review_comments (review_id, author_id, body, file_path, line, resolved, created_at)
           VALUES ($1,$2,$3,$4,$5,$6, now() - ($7 || ' hours')::interval)`,
          [reviewId, pick(allIds), c.body, c.file, c.line, c.resolved, String(Math.floor(rand() * 48))],
        );
      }
    }

    /* -------------------------------------------------------- deployments */
    const deploySeeds = [
      { env: 'PRODUCTION', v: '1.4.2', st: 'SUCCEEDED', h: 30, dur: 412 },
      { env: 'PRODUCTION', v: '1.4.1', st: 'ROLLED_BACK', h: 72, dur: 198 },
      { env: 'PRODUCTION', v: '1.4.0', st: 'SUCCEEDED', h: 120, dur: 388 },
      { env: 'STAGING', v: '1.5.0-rc.3', st: 'SUCCEEDED', h: 4, dur: 243 },
      { env: 'STAGING', v: '1.5.0-rc.2', st: 'FAILED', h: 26, dur: 96 },
      { env: 'DEVELOPMENT', v: '1.5.0-dev.88', st: 'SUCCEEDED', h: 1, dur: 121 },
      { env: 'DEVELOPMENT', v: '1.5.0-dev.87', st: 'SUCCEEDED', h: 6, dur: 118 },
    ] as const;

    for (const d of deploySeeds) {
      // Timestamps are computed here rather than in SQL: reusing one parameter
      // both as the integer duration column and inside a text concatenation
      // leaves Postgres unable to deduce a single type for it.
      const startedAt = new Date(Date.now() - d.h * 3_600_000);
      const finishedAt = new Date(startedAt.getTime() + d.dur * 1000);
      await tx.query(
        `INSERT INTO deployments (project_id, repository_id, environment, version, status, commit_sha,
                                  branch, triggered_by, approved_by, notes, duration_seconds,
                                  created_at, finished_at, log_url)
         VALUES ($1,$2,$3,$4,$5,$6,'main',$7,$8,$9,$10,$11,$12,
                 'https://ci.xenoware.dev/runs/4821')`,
        [
          xsp, repoId, d.env, d.v, d.st,
          Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join(''),
          pick(allIds), d.env === 'PRODUCTION' ? ava : null,
          d.st === 'FAILED' ? 'Migration lock timed out after 90s.'
            : d.st === 'ROLLED_BACK' ? 'Rolled back after error-rate alert fired.' : null,
          d.dur, startedAt, finishedAt,
        ],
      );
    }

    /* ----------------------------------------------------------- calendar */
    const events = [
      { t: 'Daily standup', k: 'STANDUP', h: 18, dur: 0.25, rec: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
      { t: 'Sprint 24.3 review', k: 'REVIEW', h: 6 * 24, dur: 1 },
      { t: 'Sprint 24.3 retrospective', k: 'RETRO', h: 6 * 24 + 1.5, dur: 1 },
      { t: 'Sprint 24.4 planning', k: 'MEETING', h: 7 * 24, dur: 1.5 },
      { t: 'Release 1.5.0 to production', k: 'RELEASE', h: 9 * 24, dur: 2 },
      { t: 'Architecture deep dive: multi-tenancy', k: 'MEETING', h: 2 * 24, dur: 1 },
      { t: 'Mina on leave', k: 'LEAVE', h: 4 * 24, dur: 48 },
      { t: 'Security review sign-off', k: 'DEADLINE', h: 5 * 24, dur: 0.5 },
    ] as const;

    for (const e of events) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO calendar_events (project_id, title, description, kind, starts_at, ends_at,
                                      all_day, location, meeting_url, organizer_id, recurrence_rule, reminder_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          xsp, e.t, `${e.t} for the XenoSpace platform team.`, e.k,
          hourOffset(e.h), hourOffset(e.h + e.dur), e.k === 'LEAVE',
          e.k === 'LEAVE' ? null : 'Remote', e.k === 'LEAVE' ? null : 'https://meet.xenoware.dev/xsp',
          pick([ava, rhys]), 'rec' in e ? e.rec : null, 15,
        ],
      );
      for (const userId of pickSome(allIds, 5)) {
        await tx.query(
          `INSERT INTO event_attendees (event_id, user_id, response) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [rows[0]!.id, userId, pick(['ACCEPTED', 'ACCEPTED', 'PENDING', 'TENTATIVE'])],
        );
      }
    }

    /* ----------------------------------------------- knowledge base + graph */
    const notes = [
      { title: 'XenoSpace Engineering Handbook', folder: 'Onboarding', icon: '📘', tags: ['handbook', 'onboarding'], body: `# Engineering Handbook\n\nWelcome. Start with [[XenoSpace Architecture Overview]], then read [[XenoSpace Development Workflow]].\n\nOur conventions are described in [[XenoSpace Code Review Standards]] and the security posture in [[XenoSpace Security Model]].\n\n## First week\n\n- Pair with your onboarding buddy\n- Ship one small change end to end\n- Read [[XenoSpace Incident Response]]\n` },
      { title: 'XenoSpace Architecture Overview', folder: 'Architecture', icon: '🏗️', tags: ['architecture', 'reference'], body: `# Architecture Overview\n\nA React SPA talks to an Express API over REST, with Socket.IO for realtime. Postgres is the only source of truth; Redis carries rate limits and socket fan-out.\n\nSee [[XenoSpace Data Model]] for the schema and [[XenoSpace Security Model]] for the trust boundaries.\n\n## Why a split client and server\n\nThe API is consumed by the web app today and the Orbit mobile client next, so the contract lives in a shared package rather than inside the web build.\n` },
      { title: 'XenoSpace Data Model', folder: 'Architecture', icon: '🗂️', tags: ['architecture', 'database'], body: `# Data Model\n\nEvery enum-like column is text plus a CHECK constraint, mirroring the shared domain module. Deletes cascade from the owning aggregate.\n\nSee [[XenoSpace Architecture Overview]].\n\n## Conventions\n\n- ids are uuid\n- all timestamps are timestamptz\n- \`updated_at\` is maintained by a trigger, never by hand\n` },
      { title: 'XenoSpace Security Model', folder: 'Architecture', icon: '🔐', tags: ['security', 'rbac'], body: `# Security Model\n\nAuthorization is permission-based, never role-based at the call site. See [[XenoSpace RBAC Matrix]].\n\n## Boundaries\n\n- Access tokens are short-lived and held in memory\n- Refresh tokens are httpOnly, hashed at rest, single-use and rotated\n- Reuse of a rotated token revokes the whole session family\n\nRelated: [[XenoSpace Incident Response]]\n` },
      { title: 'XenoSpace RBAC Matrix', folder: 'Engineering', icon: '🧮', tags: ['security', 'rbac', 'reference'], body: `# RBAC Matrix\n\nTwo roles today: team lead (ADMIN) and developer.\n\nDevelopers hold ownership-scoped permissions suffixed \`_own\`; holding one authorizes the action only on records they own. See [[XenoSpace Security Model]].\n` },
      { title: 'XenoSpace Development Workflow', folder: 'Engineering', icon: '🔁', tags: ['process'], body: `# Development Workflow\n\nBranch, open a review, get one approval, merge. The board status follows the work, not the other way round.\n\nSee [[XenoSpace Code Review Standards]] and [[XenoSpace Release Checklist]].\n` },
      { title: 'XenoSpace Code Review Standards', folder: 'Engineering', icon: '🔎', tags: ['process', 'quality'], body: `# Code Review Standards\n\nReview for correctness first, then clarity. One unresolved objection holds the review regardless of approvals.\n\nAuthors cannot approve their own work. See [[XenoSpace Development Workflow]].\n` },
      { title: 'XenoSpace Release Checklist', folder: 'Runbooks', icon: '🚀', tags: ['runbook', 'release'], body: `# Release Checklist\n\n1. Staging green for 24h\n2. Migrations reviewed and reversible\n3. Team lead approves the production deploy\n4. Watch error rate for 30 minutes\n\nIf it goes wrong, follow [[XenoSpace Incident Response]].\n` },
      { title: 'XenoSpace Incident Response', folder: 'Runbooks', icon: '🚨', tags: ['runbook', 'oncall'], body: `# Incident Response\n\nDeclare early. Raise an S1 issue, open #incidents, and name one coordinator.\n\nRoll back first and diagnose afterwards — see [[XenoSpace Release Checklist]].\n\nPost-incident, write it up and link it from [[XenoSpace Postmortem Log]].\n` },
      { title: 'XenoSpace Postmortem Log', folder: 'Runbooks', icon: '📝', tags: ['oncall', 'quality'], body: `# Postmortem Log\n\n## 1.4.1 rollback\n\nMigration lock timed out behind a long-running analytics query. Fixed by setting a lock timeout and running the migration as a release step.\n\nSee [[XenoSpace Incident Response]].\n` },
      { title: 'XenoSpace Onboarding Checklist', folder: 'Onboarding', icon: '✅', tags: ['onboarding'], body: `# Onboarding Checklist\n\n- [ ] Accounts and 2FA\n- [ ] Read [[XenoSpace Engineering Handbook]]\n- [ ] Run the stack locally\n- [ ] Ship a first change\n\nSomething missing here? It probably belongs in [[XenoSpace Local Development Setup]].\n` },
    ];

    const noteIds: Record<string, string> = {};
    for (const n of notes) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO kb_notes (project_id, title, content, tags, visibility, folder, icon,
                               author_id, last_edited_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'TEAM',$5,$6,$7,$8,
                 now() - ($9 || ' days')::interval, now() - ($10 || ' hours')::interval)
         RETURNING id`,
        [
          xsp, n.title, n.body, n.tags, n.folder, n.icon, pick(allIds), pick(allIds),
          String(Math.floor(rand() * 60) + 5), String(Math.floor(rand() * 100)),
        ],
      );
      noteIds[n.title] = rows[0]!.id;
    }

    // Materialise the wiki links so the graph view has edges, including the
    // deliberate orphan (`Local Development Setup` is referenced but unwritten).
    const { extractWikiLinks } = await import('../modules/kb/kb.service.js');
    for (const n of notes) {
      for (const target of extractWikiLinks(n.body)) {
        await tx.query(
          `INSERT INTO kb_links (source_id, target_id, target_title) VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [noteIds[n.title], noteIds[target] ?? null, target],
        );
      }
    }

    /* --------------------------------------------------------------- chat */
    const channels = [
      { name: 'general', topic: 'Anything and everything', kind: 'PUBLIC', project: null },
      { name: 'engineering', topic: 'Platform engineering', kind: 'PUBLIC', project: xsp },
      { name: 'incidents', topic: 'Live incidents only — keep it signal', kind: 'PUBLIC', project: xsp },
      { name: 'releases', topic: 'Deploy announcements', kind: 'PUBLIC', project: xsp },
    ] as const;

    const conversation: Record<string, string[]> = {
      general: [
        'Morning all — standup in ten.',
        'Running two minutes late, starting without me is fine.',
        'Coffee machine on the third floor is working again. Priorities.',
      ],
      engineering: [
        'The fractional ranking approach is in — a reorder is one row now instead of renumbering the column.',
        'Nice. Does it handle two people dragging the same card at once?',
        'It does. Second write lands between the new neighbours, so the worst case is a surprising order, not a lost card.',
        'I hit something while testing: failed logins were not incrementing the counter, so lockout never fired.',
        'That was a rollback trap — the increment was inside the transaction that threw. Fixed and covered by a test.',
        'Good find. That is exactly the kind of bug that only shows up under test.',
      ],
      incidents: [
        '1.4.1 is erroring at about 4% on checkout. Rolling back now.',
        'Rollback complete, error rate back to baseline. Migration lock timed out behind an analytics query.',
        'Writing it up in the postmortem log. Action: set a lock timeout and move migrations to a release step.',
      ],
      releases: [
        '1.4.2 is live in production. 412s build, no errors.',
        '1.5.0-rc.3 up on staging — please poke at the board and the knowledge base graph.',
      ],
    };

    for (const c of channels) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO channels (name, topic, kind, project_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [c.name, c.topic, c.kind, c.project, ava],
      );
      const channelId = rows[0]!.id;
      for (const userId of allIds) {
        await tx.query(
          `INSERT INTO channel_members (channel_id, user_id, last_read_at)
           VALUES ($1,$2, now() - interval '2 hours') ON CONFLICT DO NOTHING`,
          [channelId, userId],
        );
      }

      const messages = conversation[c.name] ?? [];
      for (const [i, body] of messages.entries()) {
        const { rows: msg } = await tx.query<{ id: string }>(
          `INSERT INTO messages (channel_id, author_id, body, client_id, created_at)
           VALUES ($1,$2,$3,$4, now() - ($5 || ' minutes')::interval) RETURNING id`,
          [channelId, allIds[i % allIds.length], body, `seed-${c.name}-${i}`, String((messages.length - i) * 23)],
        );
        if (i % 3 === 1) {
          await tx.query(
            `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)
             ON CONFLICT DO NOTHING`,
            [msg[0]!.id, pick(allIds), pick(['👍', '🎉', '🙌', '🔥'])],
          );
        }
      }
    }

    /* -------------------------------------------------------------- files */

    /*
     * Real bytes are written for each seeded file, so the Files page has
     * content *and* the download endpoint actually works. Metadata-only rows
     * would look right and 404 on click.
     */
    const seededFiles = [
      { name: 'architecture-decision-004.md', mime: 'text/markdown', folder: 'Architecture', desc: 'ADR: split client and server', body: '# ADR 004: Split client and server\n\nStatus: accepted\n\nThe API is consumed by the web app today and a mobile client next, so the contract lives in a shared package.\n' },
      { name: 'sprint-24.3-notes.md', mime: 'text/markdown', folder: 'Engineering', desc: 'Planning notes', body: '# Sprint 24.3\n\nGoal: ship the Kanban board and sprint reporting end to end.\n\n- Capacity 42 points\n- Risk: estimates on board work ran a third over last sprint\n' },
      { name: 'rbac-matrix.csv', mime: 'text/csv', folder: 'Engineering', desc: 'Permission matrix export', body: 'permission,team_lead,developer\nproject:create,yes,no\ntask:assign,yes,no\ntask:update_own,yes,yes\naudit:read,yes,no\n' },
      { name: 'incident-1.4.1-timeline.md', mime: 'text/markdown', folder: 'Runbooks', desc: 'Rollback timeline', body: '# 1.4.1 rollback\n\n14:02 deploy started\n14:09 error rate 4%\n14:11 rollback initiated\n14:16 baseline restored\n' },
    ];

    {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { dirname: dir, join } = await import('node:path');
      const crypto = await import('node:crypto');
      const { fromPackageRoot } = await import('../lib/paths.js');
      const { env: config } = await import('../config/env.js');

      // Same resolution the server uses, so seeded files are found on download.
      const uploadsRoot = fromPackageRoot(config.UPLOAD_DIR);

      for (const f of seededFiles) {
        const buffer = Buffer.from(f.body, 'utf8');
        const ext = f.name.split('.').pop() ?? 'bin';
        const storageKey = `2026/10/${crypto.randomBytes(16).toString('hex')}.${ext}`;
        const target = join(uploadsRoot, storageKey);
        await mkdir(dir(target), { recursive: true });
        await writeFile(target, buffer);

        await tx.query(
          `INSERT INTO files (project_id, name, storage_key, mime_type, size_bytes, checksum,
                              folder, description, visibility, uploaded_by, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'TEAM',$9, now() - ($10 || ' hours')::interval)`,
          [
            xsp, f.name, storageKey, f.mime, buffer.byteLength,
            crypto.createHash('sha256').update(buffer).digest('hex'),
            f.folder, f.desc, pick(projectMembers.XSP ?? allIds),
            String(Math.floor(rand() * 72)),
          ],
        );
      }
    }

    /* ------------------------------------------------------- notifications */
    for (const userId of devIds) {
      for (const n of [
        { k: 'TASK_ASSIGNED', t: 'XSP-5 assigned to you', b: 'Developer dashboard analytics queries', read: false },
        { k: 'REVIEW_REQUESTED', t: 'Review requested: XSP-PR22', b: 'Knowledge base graph view', read: false },
        { k: 'MENTION', t: 'Ava mentioned you in #engineering', b: 'Does it handle two people dragging the same card?', read: true },
        { k: 'DEPLOY_STATUS', t: 'Deploy succeeded: 1.4.2', b: null, read: true },
      ]) {
        await tx.query(
          `INSERT INTO notifications (user_id, kind, title, body, link, actor_id, read_at, created_at)
           VALUES ($1,$2,$3,$4,'/dashboard',$5,$6, now() - ($7 || ' hours')::interval)`,
          [userId, n.k, n.t, n.b, ava, n.read ? hourOffset(-2) : null, String(Math.floor(rand() * 40))],
        );
      }
    }

    /* ------------------------------------------------------------ activity */
    for (const a of [
      { action: 'task.created', type: 'task', label: 'Knowledge base wiki-link graph view' },
      { action: 'review.approved', type: 'review', label: 'Kanban drag and drop' },
      { action: 'deployment.succeeded', type: 'deployment', label: '1.4.2 → PRODUCTION' },
      { action: 'sprint.started', type: 'sprint', label: 'Sprint 24.3' },
      { action: 'issue.created', type: 'issue', label: 'Production deploy rolled back' },
      { action: 'kb.created', type: 'kb_note', label: 'XenoSpace Incident Response' },
      { action: 'project.member_added', type: 'project', label: 'XenoSpace Platform' },
      { action: 'task.moved', type: 'task', label: 'Socket.IO presence and typing indicators' },
    ]) {
      await tx.query(
        `INSERT INTO activity_log (actor_id, action, entity_type, entity_label, project_id, created_at)
         VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' hours')::interval)`,
        [pick(allIds), a.action, a.type, a.label, xsp, String(Math.floor(rand() * 60))],
      );
    }

    void nextSprint;
    // Seeded leads are demoted again if ADMIN_EMAILS pins someone else.
    await reconcileAdminRoles(tx);
    logger.info('seed complete');
    return { users: USERS.length, projects: projects.length, tasks: taskCount };
  });
}

function runAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runAsScript()) {
  seed()
    .then(async (summary) => {
      // eslint-disable-next-line no-console
      console.log(
        `\n  Seeded ${summary.users} users, ${summary.projects} projects, ${summary.tasks} tasks.\n\n` +
          `  Sign in with any of these — password is the same for all:\n\n` +
          `    Team lead   ava@xenospace.dev\n` +
          `    Team lead   rhys@xenospace.dev\n` +
          `    Developer   mina@xenospace.dev\n` +
          `    Developer   diego@xenospace.dev\n` +
          `    Developer   priya@xenospace.dev\n\n` +
          `    Password    ${DEMO_PASSWORD}\n`,
      );
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error({ err }, 'seed failed');
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
