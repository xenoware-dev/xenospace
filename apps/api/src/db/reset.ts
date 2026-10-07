import { realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fromPackageRoot } from '../lib/paths.js';
import { acquireDirLock } from './index.js';
import { env, isProd } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * Drops the local development database.
 *
 * Only ever touches the PGlite directory. A configured DATABASE_URL points at a
 * real Postgres — quite possibly a shared one — so this refuses to run against
 * it rather than offering to drop someone's schema.
 */
async function reset(): Promise<void> {
  if (isProd) throw new Error('Refusing to reset in production.');
  if (env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is set, so this would target a real Postgres. Drop and recreate that schema yourself.',
    );
  }

  const dataDir = fromPackageRoot(env.PGLITE_PATH);

  // Refuses while a server or seed holds the database, rather than deleting it
  // from under a running process.
  const release = acquireDirLock(dataDir);
  try {
    await rm(dataDir, { recursive: true, force: true });
  } finally {
    release();
  }
  logger.info({ dataDir }, 'local database removed — run db:migrate and db:seed next');
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
  reset()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'reset failed');
      process.exit(1);
    });
}
