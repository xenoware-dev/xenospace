import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Migration loader.
 *
 * The `.sql` files are the source of truth — they stay reviewable and get
 * syntax highlighting, which an escaped TS string literal would not. They are
 * read from disk at startup, which costs one stat per file once per boot.
 */

export interface Migration {
  id: string;
  sql: string;
}

/**
 * Locates the migrations directory. Under tsx this module sits in
 * `src/db/migrations`; in the bundled build everything collapses into `dist`,
 * so the build copies the SQL to `dist/migrations` and that is checked too.
 */
function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [here, join(here, 'migrations'), join(here, '..', 'migrations')];
  for (const dir of candidates) {
    if (existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.sql'))) return dir;
  }
  throw new Error(
    `Could not locate migration .sql files. Looked in:\n${candidates.map((c) => `  • ${c}`).join('\n')}`,
  );
}

export function loadMigrations(): Migration[] {
  const dir = migrationsDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    // Filenames are zero-padded, so a lexical sort is the apply order.
    .sort()
    .map((file) => ({
      id: file.replace(/\.sql$/, ''),
      sql: readFileSync(join(dir, file), 'utf8'),
    }));
}
