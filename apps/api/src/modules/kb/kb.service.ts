import type { KbGraph, KbNote, Paginated } from '@xenospace/shared';
import { db, type Queryable } from '../../db/index.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { paginate } from '../../lib/http.js';
import { recordActivity } from '../../middleware/audit.js';
import type { Principal } from '../../middleware/authenticate.js';
import { assertProjectAccess, isAdmin, visibleProjectIds, WhereBuilder } from '../common/access.js';

/**
 * Knowledge base.
 *
 * Notes link to each other with `[[wiki links]]`, exactly as in Obsidian. The
 * links are extracted on save into `kb_links`, so the graph view is a single
 * join rather than a parse of every note on every read.
 */

/** Matches `[[Target]]` and `[[Target|display text]]`. */
const WIKI_LINK = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;

export function extractWikiLinks(content: string): string[] {
  const titles = new Set<string>();
  for (const match of content.matchAll(WIKI_LINK)) {
    const title = match[1]?.trim();
    // Bound both the count and the length: a note is user input, and the links
    // become rows.
    if (title && title.length <= 200) titles.add(title);
    if (titles.size >= 200) break;
  }
  return [...titles];
}

/**
 * Rewrites a note's outbound links.
 *
 * A link to a note that does not exist yet is kept with a null target, which is
 * what lets the graph show "orphan" links — the unwritten pages the team keeps
 * referring to.
 */
async function syncLinks(tx: Queryable, noteId: string, content: string): Promise<void> {
  const titles = extractWikiLinks(content);
  await tx.query(`DELETE FROM kb_links WHERE source_id = $1`, [noteId]);
  if (titles.length === 0) return;

  await tx.query(
    `INSERT INTO kb_links (source_id, target_id, target_title)
     SELECT $1, n.id, t.title
       FROM unnest($2::text[]) AS t(title)
       LEFT JOIN kb_notes n ON lower(n.title) = lower(t.title)
      WHERE t.title <> ''
     ON CONFLICT (source_id, target_title) DO NOTHING`,
    [noteId, titles],
  );
}

/**
 * Resolves links that were pointing at this note's title before it existed.
 * Without this, creating a note would leave earlier references dangling.
 */
async function resolveInboundOrphans(tx: Queryable, noteId: string, title: string): Promise<void> {
  await tx.query(
    `UPDATE kb_links SET target_id = $1
      WHERE target_id IS NULL AND lower(target_title) = lower($2)`,
    [noteId, title],
  );
}

const NOTE_SELECT = `
  SELECT n.id, n.project_id, n.title, n.content, n.tags, n.visibility, n.folder, n.icon,
         n.created_at, n.updated_at,
         ${userJoinColumns('a', 'author')},
         ${userJoinColumns('e', 'editor')}
    FROM kb_notes n
    LEFT JOIN users a ON a.id = n.author_id
    LEFT JOIN users e ON e.id = n.last_edited_by
`;

function mapNote(row: Record<string, unknown>): KbNote {
  const content = (row.content as string) ?? '';
  return {
    id: row.id as string,
    projectId: (row.project_id as string | null) ?? null,
    title: row.title as string,
    content,
    tags: (row.tags as string[]) ?? [],
    visibility: row.visibility as KbNote['visibility'],
    folder: (row.folder as string | null) ?? null,
    icon: (row.icon as string | null) ?? null,
    author: nestedUser(row, 'author') ?? {
      id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER', status: 'DEACTIVATED',
      avatarUrl: null, avatarColor: '#94a3b8', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    lastEditedBy: nestedUser(row, 'editor'),
    outboundLinks: [],
    inboundLinks: [],
    wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
    createdAt: iso(row.created_at as string)!,
    updatedAt: iso(row.updated_at as string)!,
  };
}

/**
 * Visibility clause.
 *
 * PRIVATE notes are the author's alone, TEAM notes follow project membership,
 * and PUBLIC notes are workspace-wide. A project-less TEAM note is visible to
 * everyone, which is how general documentation works.
 */
function applyNoteScope(where: WhereBuilder, actor: Principal, visibleIds: string[]): void {
  if (isAdmin(actor)) return;
  where.add(
    `(
       n.author_id = ?
       OR (n.visibility = 'PUBLIC')
       OR (n.visibility = 'TEAM' AND (n.project_id IS NULL OR n.project_id = ANY(?::uuid[])))
     )`,
    actor.id, visibleIds,
  );
}

export async function listNotes(
  actor: Principal,
  f: { page: number; pageSize: number; projectId?: string; tag?: string; folder?: string; q?: string; visibility?: string[] },
): Promise<Paginated<KbNote>> {
  if (f.projectId) await assertProjectAccess(actor, f.projectId);
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);

  const where = new WhereBuilder();
  applyNoteScope(where, actor, visibleIds);
  where.addIf(f.projectId, `n.project_id = ?`, f.projectId);
  where.addIf(f.tag, `? = ANY(n.tags)`, f.tag);
  where.addIf(f.folder, `n.folder = ?`, f.folder);
  where.addIf(f.visibility, `n.visibility = ANY(?::text[])`, f.visibility);
  where.addIf(
    f.q,
    `(to_tsvector('english', n.title || ' ' || n.content) @@ plainto_tsquery('english', ?) OR n.title ILIKE ?)`,
    f.q, `%${f.q}%`,
  );

  const offset = (f.page - 1) * f.pageSize;
  const [{ rows }, { rows: counts }] = await Promise.all([
    db().query<Record<string, unknown>>(
      `${NOTE_SELECT} ${where.sql} ORDER BY n.updated_at DESC LIMIT ${f.pageSize} OFFSET ${offset}`,
      where.params,
    ),
    db().query<{ n: number }>(`SELECT count(*)::int AS n FROM kb_notes n ${where.sql}`, where.params),
  ]);

  // The list view does not need full bodies; a preview keeps the payload small.
  const notes = rows.map(mapNote).map((note) => ({ ...note, content: note.content.slice(0, 280) }));
  return paginate(notes, counts[0]?.n ?? 0, f.page, f.pageSize);
}

export async function getNote(actor: Principal, id: string): Promise<KbNote> {
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);
  const where = new WhereBuilder();
  where.add(`n.id = ?`, id);
  applyNoteScope(where, actor, visibleIds);

  const { rows } = await db().query<Record<string, unknown>>(`${NOTE_SELECT} ${where.sql}`, where.params);
  const row = rows[0];
  if (!row) throw notFound('Note');
  const note = mapNote(row);

  const [{ rows: outbound }, { rows: inbound }] = await Promise.all([
    db().query<{ target_id: string | null; target_title: string }>(
      `SELECT target_id, target_title FROM kb_links WHERE source_id = $1 ORDER BY target_title`,
      [id],
    ),
    db().query<{ id: string; title: string }>(
      `SELECT n.id, n.title FROM kb_links l JOIN kb_notes n ON n.id = l.source_id
        WHERE l.target_id = $1 ORDER BY n.title`,
      [id],
    ),
  ]);

  note.outboundLinks = outbound.map((l) => ({ id: l.target_id, title: l.target_title }));
  note.inboundLinks = inbound.map((l) => ({ id: l.id, title: l.title }));
  return note;
}

export async function createNote(actor: Principal, input: Record<string, unknown>): Promise<KbNote> {
  if (input.projectId) await assertProjectAccess(actor, input.projectId as string);

  const id = await db().transaction(async (tx) => {
    const { rows: clash } = await tx.query<{ id: string }>(
      `SELECT id FROM kb_notes WHERE lower(title) = lower($1)`,
      [input.title as string],
    );
    // Titles must be unique because wiki links resolve by title.
    if (clash.length) throw conflict('A note with that title already exists.');

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO kb_notes (project_id, title, content, tags, visibility, folder, icon, author_id, last_edited_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
      [
        input.projectId ?? null, input.title, input.content ?? '', (input.tags as string[]) ?? [],
        input.visibility ?? 'TEAM', input.folder ?? null, input.icon ?? null, actor.id,
      ],
    );
    const noteId = rows[0]!.id;

    await syncLinks(tx, noteId, (input.content as string) ?? '');
    await resolveInboundOrphans(tx, noteId, input.title as string);
    await recordActivity(
      { actorId: actor.id, action: 'kb.created', entityType: 'kb_note', entityId: noteId, entityLabel: input.title as string, projectId: (input.projectId as string) ?? null },
      tx,
    );
    return noteId;
  });

  return getNote(actor, id);
}

export async function updateNote(actor: Principal, id: string, input: Record<string, unknown>): Promise<KbNote> {
  const existing = await getNote(actor, id);

  // A developer holds kb:update_own, so may only edit notes they authored.
  const { can } = await import('@xenospace/shared');
  if (!can(actor.role, 'kb:update') && existing.author.id !== actor.id) {
    throw forbidden('You can only edit notes you created.');
  }

  const columns: Record<string, string> = {
    title: 'title', content: 'content', tags: 'tags', visibility: 'visibility',
    folder: 'folder', icon: 'icon', projectId: 'project_id',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] === undefined) continue;
    params.push(input[key]);
    sets.push(`${column} = $${params.length}`);
  }
  params.push(actor.id);
  sets.push(`last_edited_by = $${params.length}`);

  await db().transaction(async (tx) => {
    if (input.title && (input.title as string).toLowerCase() !== existing.title.toLowerCase()) {
      const { rows: clash } = await tx.query<{ id: string }>(
        `SELECT id FROM kb_notes WHERE lower(title) = lower($1) AND id <> $2`,
        [input.title as string, id],
      );
      if (clash.length) throw conflict('A note with that title already exists.');
    }

    await tx.query(`UPDATE kb_notes SET ${sets.join(', ')} WHERE id = $1`, params);

    if (input.content !== undefined) {
      await syncLinks(tx, id, input.content as string);
    }
    if (input.title !== undefined) {
      // Links that referenced the old title now dangle; links to the new one resolve.
      await tx.query(
        `UPDATE kb_links SET target_id = NULL
          WHERE target_id = $1 AND lower(target_title) <> lower($2)`,
        [id, input.title as string],
      );
      await resolveInboundOrphans(tx, id, input.title as string);
    }
  });

  return getNote(actor, id);
}

export async function deleteNote(actor: Principal, id: string): Promise<void> {
  const existing = await getNote(actor, id);
  const { can } = await import('@xenospace/shared');
  if (!can(actor.role, 'kb:delete') && existing.author.id !== actor.id) {
    throw forbidden('You can only delete notes you created.');
  }

  await db().transaction(async (tx) => {
    // Inbound links survive as orphans rather than disappearing, so the gap is
    // visible in the graph.
    await tx.query(`UPDATE kb_links SET target_id = NULL WHERE target_id = $1`, [id]);
    await tx.query(`DELETE FROM kb_notes WHERE id = $1`, [id]);
    await recordActivity(
      { actorId: actor.id, action: 'kb.deleted', entityType: 'kb_note', entityId: id, entityLabel: existing.title, projectId: existing.projectId },
      tx,
    );
  });
}

/**
 * Graph payload for the Obsidian-style view.
 *
 * Built from the materialised link table and scoped the same way the note list
 * is, so the graph cannot reveal the existence of a note the viewer may not read.
 */
export async function graph(actor: Principal, projectId?: string): Promise<KbGraph> {
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);
  const where = new WhereBuilder();
  applyNoteScope(where, actor, visibleIds);
  where.addIf(projectId, `n.project_id = ?`, projectId);

  const { rows: nodes } = await db().query<{
    id: string; title: string; tags: string[]; folder: string | null; updated_at: string;
    inbound: number; outbound: number;
  }>(
    `SELECT n.id, n.title, n.tags, n.folder, n.updated_at,
            (SELECT count(*)::int FROM kb_links l WHERE l.target_id = n.id) AS inbound,
            (SELECT count(*)::int FROM kb_links l WHERE l.source_id = n.id) AS outbound
       FROM kb_notes n ${where.sql}
      ORDER BY n.updated_at DESC LIMIT 2000`,
    where.params,
  );

  const visible = new Set(nodes.map((n) => n.id));
  if (visible.size === 0) return { nodes: [], edges: [], orphanLinks: [] };

  const { rows: links } = await db().query<{ source_id: string; target_id: string | null; target_title: string }>(
    `SELECT source_id, target_id, target_title FROM kb_links WHERE source_id = ANY($1::uuid[])`,
    [[...visible]],
  );

  const edges: KbGraph['edges'] = [];
  const orphanLinks: KbGraph['orphanLinks'] = [];
  for (const link of links) {
    // An edge is only drawn when both ends are visible to this viewer.
    if (link.target_id && visible.has(link.target_id)) {
      edges.push({ source: link.source_id, target: link.target_id });
    } else if (!link.target_id) {
      orphanLinks.push({ source: link.source_id, title: link.target_title });
    }
  }

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      tags: n.tags ?? [],
      inbound: n.inbound,
      outbound: n.outbound,
      folder: n.folder,
      updatedAt: iso(n.updated_at)!,
    })),
    edges,
    orphanLinks,
  };
}

/** Tag and folder facets for the sidebar. */
export async function facets(actor: Principal): Promise<{ tags: Array<{ tag: string; count: number }>; folders: Array<{ folder: string; count: number }> }> {
  const visibleIds = isAdmin(actor) ? [] : await visibleProjectIds(actor);
  const where = new WhereBuilder();
  applyNoteScope(where, actor, visibleIds);

  const [{ rows: tags }, { rows: folders }] = await Promise.all([
    db().query<{ tag: string; count: number }>(
      `SELECT tag, count(*)::int AS count
         FROM kb_notes n, unnest(n.tags) AS tag
         ${where.sql}
        GROUP BY tag ORDER BY count DESC, tag LIMIT 50`,
      where.params,
    ),
    db().query<{ folder: string; count: number }>(
      `SELECT n.folder, count(*)::int AS count FROM kb_notes n
         ${where.sql ? `${where.sql} AND n.folder IS NOT NULL` : 'WHERE n.folder IS NOT NULL'}
        GROUP BY n.folder ORDER BY n.folder LIMIT 50`,
      where.params,
    ),
  ]);
  return { tags, folders };
}
