import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { env } from '@/config/env'
import {
  FILE_CATEGORY_BY_EXTENSION,
  type FileCategory,
} from '@/types/enums'

/** Absolute root of the blob store. A relative UPLOAD_DIR hangs off server/. */
export const UPLOAD_ROOT = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.resolve(process.cwd(), env.UPLOAD_DIR)

export const MAX_UPLOAD_BYTES = Math.round(env.MAX_UPLOAD_MB * 1024 * 1024)

/** Created up front so the first upload of a fresh checkout does not fail. */
export function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true })
}

/**
 * Blobs are stored under a year/month shard with a random name, never the one
 * the browser sent: two people may upload `report.pdf`, and a name chosen by a
 * client is not something to hand to the filesystem. The display name lives in
 * Mongo instead.
 */
export function buildStorageKey(originalName: string) {
  const now = new Date()
  const shard = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`
  const ext = extensionOf(originalName)
  return path.posix.join(shard, `${randomUUID()}${ext ? `.${ext}` : ''}`)
}

/** Resolves a stored key, refusing anything that escapes the upload root. */
export function absolutePathFor(storageKey: string) {
  const resolved = path.resolve(UPLOAD_ROOT, storageKey)
  if (resolved !== UPLOAD_ROOT && !resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error('Refusing to resolve a storage key outside the upload root')
  }
  return resolved
}

export function ensureShardFor(storageKey: string) {
  fs.mkdirSync(path.dirname(absolutePathFor(storageKey)), { recursive: true })
}

/**
 * Best-effort unlink. A blob that is already gone is not a reason to fail the
 * request that was trying to delete it, and the metadata row is the record of
 * truth either way.
 */
export async function removeStoredFile(storageKey?: string | null) {
  if (!storageKey) return
  try {
    await fs.promises.unlink(absolutePathFor(storageKey))
  } catch {
    // Already removed, or never written.
  }
}

export async function removeStoredFiles(storageKeys: Array<string | null | undefined>) {
  await Promise.all(storageKeys.map(removeStoredFile))
}

export function storedFileExists(storageKey?: string | null) {
  if (!storageKey) return false
  try {
    return fs.existsSync(absolutePathFor(storageKey))
  } catch {
    return false
  }
}

/** Lowercase extension without the dot, or '' when there is none. */
export function extensionOf(filename: string) {
  const ext = path.extname(filename).slice(1).toLowerCase()
  return /^[a-z0-9]{1,12}$/.test(ext) ? ext : ''
}

export function categoryFor(filename: string, mimeType?: string | null): FileCategory {
  const byExtension = FILE_CATEGORY_BY_EXTENSION[extensionOf(filename)]
  if (byExtension) return byExtension

  // A browser-supplied mime type is a weaker signal than the extension, but it
  // still beats filing a .heif photo under "other".
  if (mimeType?.startsWith('image/')) return 'IMAGE'
  if (mimeType?.startsWith('video/')) return 'VIDEO'
  if (mimeType?.startsWith('audio/')) return 'AUDIO'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType?.startsWith('text/')) return 'DOCUMENT'

  return 'OTHER'
}

/**
 * A display name safe to store and to echo back in a download header: no path
 * separators, no control characters, no leading dots.
 */
export function sanitizeName(name: string) {
  const cleaned = name
    .replace(/[/\\]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim()

  return cleaned.slice(0, 255) || 'Untitled'
}
