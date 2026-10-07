import { closeDb } from './index.js';
import { migrate } from './migrate.js';
import { logger } from '../lib/logger.js';

/**
 * `npm run db:migrate` entry point.
 *
 * Kept in its own file deliberately. The run-as-script check used to live in
 * migrate.ts, but the server imports that module, and once bundled into
 * dist/index.js the check matched the server itself: every boot ran two
 * concurrent migrations and then exited. A module that is imported must never
 * act on being executed.
 */
migrate()
  .then(async ({ applied, skipped }) => {
    if (applied.length) logger.info({ applied }, `applied ${applied.length} migration(s)`);
    else logger.info({ skipped: skipped.length }, 'schema already up to date');
    await closeDb();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error({ err }, 'migration failed');
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
