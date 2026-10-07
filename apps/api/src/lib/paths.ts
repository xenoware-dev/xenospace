import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The api package root, found by walking up to its package.json.
 *
 * Paths used to be computed by counting `..` from the calling file, which is
 * only correct for the source layout: from the bundled dist/ the same count
 * escaped the repository, so local uploads in production were written two
 * directories above it. Searching for the package works from src and dist alike.
 */
let cached: string | null = null;

export function packageRoot(): string {
  if (cached) return cached;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth++) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) {
      try {
        if ((JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string }).name === '@xenospace/api') {
          cached = dir;
          return dir;
        }
      } catch {
        // An unreadable manifest is not ours; keep walking.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate the @xenospace/api package root.');
}

/** Resolves a configured path: absolute as given, relative to the package root. */
export function fromPackageRoot(configured: string): string {
  return isAbsolute(configured) ? configured : resolve(packageRoot(), configured);
}
