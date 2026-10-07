import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, shutdownTestApp } from './helpers.js';
import { db } from '../src/db/index.js';

/** Database-level rules that the API relies on but does not itself enforce. */
describe('task completion stamping', () => {
  let projectId: string;

  beforeAll(async () => {
    await bootTestApp();
    const { rows } = await db().query<{ id: string }>(
      `INSERT INTO projects (name, key) VALUES ('Schema', 'SCH') RETURNING id`,
    );
    projectId = rows[0]!.id;
  });
  afterAll(shutdownTestApp);

  const insert = (number: number, status: string, completedAt: string | null) =>
    db().query<{ id: string; completed_at: string | null }>(
      `INSERT INTO tasks (project_id, number, title, status, completed_at)
       VALUES ($1, $2, 't', $3, $4) RETURNING id, completed_at`,
      [projectId, number, status, completedAt],
    );

  it('keeps an explicit completion time on insert, so imported history survives', async () => {
    const historic = '2026-01-15T10:00:00.000Z';
    const { rows } = await insert(1, 'DONE', historic);
    expect(new Date(rows[0]!.completed_at!).toISOString()).toBe(historic);
  });

  it('stamps now() for a DONE insert with no time given', async () => {
    const { rows } = await insert(2, 'DONE', null);
    expect(Date.now() - new Date(rows[0]!.completed_at!).getTime()).toBeLessThan(60_000);
  });

  it('clears a completion time supplied for a task that is not done', async () => {
    const { rows } = await insert(3, 'TODO', '2026-01-15T10:00:00.000Z');
    expect(rows[0]!.completed_at).toBeNull();
  });

  it('still stamps and clears on status transitions', async () => {
    const { rows } = await insert(4, 'TODO', null);
    const id = rows[0]!.id;
    const done = await db().query<{ completed_at: string | null }>(
      `UPDATE tasks SET status = 'DONE' WHERE id = $1 RETURNING completed_at`, [id]);
    expect(done.rows[0]!.completed_at).not.toBeNull();
    const reopened = await db().query<{ completed_at: string | null }>(
      `UPDATE tasks SET status = 'IN_PROGRESS' WHERE id = $1 RETURNING completed_at`, [id]);
    expect(reopened.rows[0]!.completed_at).toBeNull();
  });
});
