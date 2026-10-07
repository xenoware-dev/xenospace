import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fromPackageRoot } from '../../lib/paths.js';
import type { DocVisibility, Paginated, StoredFile } from '@xenospace/shared';
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from '@xenospace/shared';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { forbidden, notFound, tooLarge, unsupportedMedia } from '../../lib/errors.js';
import { paginate } from '../../lib/http.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { recordActivity } from '../../middleware/audit.js';
import { logger } from '../../lib/logger.js';
import type { Principal } from '../../middleware/authenticate.js';
import { applyProjectScope, assertProjectAccess, isAdmin, WhereBuilder } from '../common/access.js';

/**
 * File storage.
 *
 * Local disk by default; Supabase Storage when configured. Either way the
 * database holds an opaque `storage_key` and the client only ever receives an
 * API url — never a path or a bucket key it could manipulate.
 */

const FILE_SELECT = `
  SELECT f.id, f.project_id, f.name, f.mime_type, f.size_bytes, f.folder, f.description,
         f.visibility, f.created_at, f.storage_key,
         ${userJoinColumns('u', 'uploader')}
    FROM files f
    LEFT JOIN users u ON u.id = f.uploaded_by
`;

function mapFile(row: Record<string, unknown>): StoredFile {
  return {
    id: row.id as string,
    projectId: (row.project_id as string | null) ?? null,
    name: row.name as string,
    mimeType: row.mime_type as string,
    sizeBytes: Number(row.size_bytes),
    // Downloads always go through the API so authorization is re-checked.
    url: `/api/v1/files/${row.id as string}/download`,
    thumbnailUrl: (row.mime_type as string).startsWith('image/')
      ? `/api/v1/files/${row.id as string}/download`
      : null,
    folder: (row.folder as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    visibility: row.visibility as DocVisibility,
    uploadedBy: nestedUser(row, 'uploader') ?? {
      id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER', status: 'DEACTIVATED',
      avatarUrl: null, avatarColor: '#94a3b8', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    createdAt: iso(row.created_at as string)!,
  };
}

/** Uploads directory, anchored to the api package rather than the cwd. */
function uploadRoot(): string {
  return fromPackageRoot(env.UPLOAD_DIR);
}

/**
 * Builds the storage key.
 *
 * The key is generated, never derived from the uploaded filename: a name like
 * `../../etc/passwd` must not be able to influence where bytes land. The
 * original name is kept only as a database column, for display.
 */
function makeStorageKey(originalName: string): string {
  const ext = /\.([A-Za-z0-9]{1,12})$/.exec(originalName)?.[1]?.toLowerCase() ?? 'bin';
  const now = new Date();
  const shard = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${shard}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
}

/** Strips directory components and control characters from a display name. */
export function sanitiseFilename(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').replace(/[\u0000-\u001f\u007f]/g, '');
  return (base.trim() || 'upload').slice(0, 200);
}

export interface UploadInput {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  projectId?: string | null;
  folder?: string;
  description?: string;
  visibility?: DocVisibility;
}

/**
 * Supabase Storage credentials. The newer `sb_secret_…` keys go in `apikey`
 * only — the gateway rejects a non-JWT bearer token. A legacy service_role key
 * is a JWT and is also sent as the bearer, which older projects require.
 */
function storageAuthHeaders(): Record<string, string> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  return key.startsWith('eyJ') ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

export async function storeFile(actor: Principal, input: UploadInput): Promise<StoredFile> {
  if (input.sizeBytes > MAX_UPLOAD_BYTES) throw tooLarge('That file is larger than 25 MB.');
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(input.mimeType)) {
    throw unsupportedMedia(`Files of type ${input.mimeType} are not allowed.`);
  }
  if (input.projectId) await assertProjectAccess(actor, input.projectId);

  const name = sanitiseFilename(input.originalName);
  const storageKey = makeStorageKey(name);
  const checksum = crypto.createHash('sha256').update(input.buffer).digest('hex');

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const uploadUrl = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`;
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...storageAuthHeaders(),
        'Content-Type': input.mimeType,
        'x-upsert': 'false',
      },
      body: new Uint8Array(input.buffer),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status, storageKey }, 'supabase storage upload failed');
      throw new Error('Upload failed');
    }
  } else {
    const target = join(uploadRoot(), storageKey);
    await mkdir(dirname(target), { recursive: true });
    await new Promise<void>((done, fail) => {
      const stream = createWriteStream(target, { flags: 'wx' });
      stream.on('error', fail);
      stream.on('finish', () => done());
      stream.end(input.buffer);
    });
  }

  const { rows } = await db().query<{ id: string }>(
    `INSERT INTO files (project_id, name, storage_key, mime_type, size_bytes, checksum,
                        folder, description, visibility, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      input.projectId ?? null, name, storageKey, input.mimeType, input.sizeBytes, checksum,
      input.folder ?? null, input.description ?? null, input.visibility ?? 'TEAM', actor.id,
    ],
  );
  const id = rows[0]!.id;

  await recordActivity({
    actorId: actor.id, action: 'file.uploaded', entityType: 'file', entityId: id,
    entityLabel: name, projectId: input.projectId ?? null,
    metadata: { sizeBytes: input.sizeBytes, mimeType: input.mimeType },
  });

  return getFile(actor, id);
}

/** Visibility, mirroring the knowledge base rules. */
function applyFileScope(where: WhereBuilder, actor: Principal): void {
  if (isAdmin(actor)) return;
  where.add(
    `(
       f.uploaded_by = ?
       OR f.visibility = 'PUBLIC'
       OR (f.visibility = 'TEAM' AND (
            f.project_id IS NULL
            OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = f.project_id AND pm.user_id = ?)
          ))
     )`,
    actor.id, actor.id,
  );
}

export async function listFiles(
  actor: Principal,
  f: { page: number; pageSize: number; projectId?: string; folder?: string; q?: string; mimeGroup?: string },
): Promise<Paginated<StoredFile>> {
  if (f.projectId) await assertProjectAccess(actor, f.projectId);

  const where = new WhereBuilder();
  where.raw('f.deleted_at IS NULL');
  applyFileScope(where, actor);
  where.addIf(f.projectId, `f.project_id = ?`, f.projectId);
  where.addIf(f.folder, `f.folder = ?`, f.folder);
  where.addIf(f.q, `f.name ILIKE ?`, `%${f.q}%`);

  if (f.mimeGroup === 'image') where.raw(`f.mime_type LIKE 'image/%'`);
  else if (f.mimeGroup === 'archive') where.raw(`f.mime_type = 'application/zip'`);
  else if (f.mimeGroup === 'document') {
    where.raw(`(f.mime_type LIKE 'text/%' OR f.mime_type = 'application/pdf'
                OR f.mime_type LIKE 'application/vnd.openxmlformats%')`);
  } else if (f.mimeGroup === 'other') {
    where.raw(`f.mime_type NOT LIKE 'image/%' AND f.mime_type NOT LIKE 'text/%'
               AND f.mime_type <> 'application/pdf' AND f.mime_type <> 'application/zip'
               AND f.mime_type NOT LIKE 'application/vnd.openxmlformats%'`);
  }

  const offset = (f.page - 1) * f.pageSize;
  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${FILE_SELECT} ${where.sql} ORDER BY f.created_at DESC LIMIT ${f.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(`SELECT count(*)::int AS n FROM files f ${where.sql}`, where.params),
  ]);

  return paginate(rows.map(mapFile), counts[0]?.n ?? 0, f.page, f.pageSize);
}

export async function getFile(actor: Principal, id: string): Promise<StoredFile> {
  const where = new WhereBuilder();
  where.add(`f.id = ?`, id);
  where.raw('f.deleted_at IS NULL');
  applyFileScope(where, actor);

  const { rows } = await db().query<Record<string, unknown>>(`${FILE_SELECT} ${where.sql}`, where.params);
  const row = rows[0];
  if (!row) throw notFound('File');
  return mapFile(row);
}

/**
 * Resolves a file's bytes for download.
 *
 * Authorization runs first via `getFile`. The resolved path is then checked to
 * be inside the uploads root — defence in depth against a storage key that
 * somehow escaped generation.
 */
export async function readFile(
  actor: Principal,
  id: string,
): Promise<{ file: StoredFile; localPath?: string; signedUrl?: string }> {
  const file = await getFile(actor, id);
  const { rows } = await db().query<{ storage_key: string }>(
    `SELECT storage_key FROM files WHERE id = $1`,
    [id],
  );
  const storageKey = rows[0]?.storage_key;
  if (!storageKey) throw notFound('File');

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const res = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/sign/${env.SUPABASE_STORAGE_BUCKET}/${storageKey}`,
      {
        method: 'POST',
        headers: {
          ...storageAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw notFound('File');
    const { signedURL } = (await res.json()) as { signedURL: string };
    return { file, signedUrl: `${env.SUPABASE_URL}/storage/v1${signedURL}` };
  }

  const root = uploadRoot();
  const localPath = resolve(root, storageKey);
  // Path traversal guard: the resolved path must stay under the root.
  if (!localPath.startsWith(root + '/') && localPath !== root) {
    logger.error({ id, storageKey }, 'refusing to serve a file outside the uploads root');
    throw notFound('File');
  }
  try {
    await stat(localPath);
  } catch {
    throw notFound('File');
  }
  return { file, localPath };
}

export async function deleteFile(actor: Principal, id: string): Promise<void> {
  const { rows } = await db().query<{ uploaded_by: string | null; name: string; project_id: string | null; storage_key: string }>(
    `SELECT uploaded_by, name, project_id, storage_key FROM files WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  const row = rows[0];
  if (!row) throw notFound('File');

  // A developer may remove their own uploads; a lead may remove any.
  if (row.uploaded_by !== actor.id && !isAdmin(actor)) throw forbidden();

  // Soft-deleted first so an attachment reference never dangles mid-request.
  await db().query(`UPDATE files SET deleted_at = now() WHERE id = $1`, [id]);
  await recordActivity({
    actorId: actor.id, action: 'file.deleted', entityType: 'file', entityId: id,
    entityLabel: row.name, projectId: row.project_id,
  });

  // Best effort: the row is already gone from every read path.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_STORAGE_BUCKET}`, {
      method: 'DELETE',
      headers: { ...storageAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [row.storage_key] }),
      signal: AbortSignal.timeout(15_000),
    }).catch((err: unknown) => {
      logger.warn({ err, storageKey: row.storage_key }, 'supabase storage delete failed');
      return null;
    });
    if (res && !res.ok) logger.warn({ status: res.status, storageKey: row.storage_key }, 'supabase storage delete failed');
  } else {
    const target = resolve(uploadRoot(), row.storage_key);
    if (target.startsWith(uploadRoot())) {
      await unlink(target).catch(() => undefined);
    }
  }
}

/** Folder facets for the files sidebar. */
export async function folders(actor: Principal, projectId?: string): Promise<Array<{ folder: string; count: number }>> {
  const where = new WhereBuilder();
  where.raw('f.deleted_at IS NULL AND f.folder IS NOT NULL');
  applyFileScope(where, actor);
  where.addIf(projectId, `f.project_id = ?`, projectId);

  const { rows } = await db().query<{ folder: string; count: number }>(
    `SELECT f.folder, count(*)::int AS count FROM files f ${where.sql}
      GROUP BY f.folder ORDER BY f.folder LIMIT 100`,
    where.params,
  );
  return rows;
}
