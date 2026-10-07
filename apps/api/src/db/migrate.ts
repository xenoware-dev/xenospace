import crypto from 'node:crypto';
import { getDb, closeDb, type Database } from './index.js';
import { loadMigrations } from './migrations/index.js';
import { logger } from '../lib/logger.js';

const checksum = (sql: string) => crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);

/** True when `schema_migrations` exists, i.e. at least one migration has run. */
async function hasLedger(db: Database): Promise<boolean> {
  const { rows } = await db.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = 'schema_migrations'
     ) AS present`,
  );
  return rows[0]?.present === true;
}

/**
 * Applies pending migrations in order.
 *
 * Each migration runs inside its own transaction, so a failure leaves the
 * database on the last complete migration rather than halfway through one.
 * Already-applied migrations are verified by checksum: editing a shipped
 * migration is a mistake that silently diverges environments, so it aborts.
 */
export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const db = await getDb();
  const all = loadMigrations();
  const applied: string[] = [];
  const skipped: string[] = [];

  const ledgerExists = await hasLedger(db);
  const known = new Map<string, string>();
  if (ledgerExists) {
    const { rows } = await db.query<{ id: string; checksum: string }>('SELECT id, checksum FROM schema_migrations');
    for (const row of rows) known.set(row.id, row.checksum);
  }

  for (const migration of all) {
    const sum = checksum(migration.sql);
    const seen = known.get(migration.id);

    if (seen !== undefined) {
      if (seen !== sum) {
        throw new Error(
          `Migration ${migration.id} has changed since it was applied ` +
            `(recorded ${seen}, now ${sum}). Never edit an applied migration — add a new one instead.`,
        );
      }
      skipped.push(migration.id);
      continue;
    }

    logger.info({ migration: migration.id }, 'applying migration');
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      // 001_init creates the ledger itself, so this insert must come after the
      // migration body rather than before it.
      await tx.query(
        'INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [migration.id, sum],
      );
    });
    applied.push(migration.id);
  }

  return { applied, skipped };
}
