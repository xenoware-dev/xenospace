import type { Notification, NotificationKind } from '@xenospace/shared';
import { db, type Queryable } from '../../db/index.js';
import { logger } from '../../lib/logger.js';
import { nestedUser, userJoinColumns, iso } from '../../lib/serialize.js';
import { realtime } from '../../realtime/socket.js';
import { toPreferences } from '../../lib/serialize.js';

/**
 * Notification fan-out.
 *
 * Delivery respects each recipient's per-kind preferences, and a user is never
 * notified about their own action — being told "you assigned this to yourself"
 * is noise that trains people to ignore the bell.
 */

export interface NotifyInput {
  userIds: string[];
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

const SELECT_NOTIFICATION = `
  SELECT n.id, n.kind, n.title, n.body, n.link, n.read_at, n.created_at,
         ${userJoinColumns('a', 'actor')}
    FROM notifications n
    LEFT JOIN users a ON a.id = n.actor_id
`;

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    kind: row.kind as NotificationKind,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    link: (row.link as string | null) ?? null,
    actor: nestedUser(row, 'actor'),
    readAt: iso(row.read_at as string | null),
    createdAt: iso(row.created_at as string) ?? new Date().toISOString(),
  };
}

/**
 * Creates notifications and pushes them over the socket.
 *
 * Failures are logged, never thrown: a notification is a side effect of the
 * user's action, and losing one must not fail the action itself.
 */
export async function notify(input: NotifyInput, tx?: Queryable): Promise<void> {
  // A placeholder author (a former member, or a GitHub user with no account)
  // has no real id; it is dropped here rather than failing the uuid cast.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const recipients = [...new Set(input.userIds)].filter((id) => id && UUID.test(id) && id !== input.actorId);
  if (recipients.length === 0) return;

  try {
    const runner = tx ?? db();

    // Honour each recipient's opt-outs for this kind.
    const { rows: prefs } = await runner.query<{ id: string; preferences: Record<string, unknown> | null }>(
      `SELECT id, preferences FROM users WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [recipients],
    );
    const wanted = prefs
      .filter((p) => toPreferences(p.preferences).notifyOn[input.kind] !== false)
      .map((p) => p.id);
    if (wanted.length === 0) return;

    // One multi-row insert rather than a statement per recipient.
    const { rows: inserted } = await runner.query<{ id: string; user_id: string }>(
      `INSERT INTO notifications (user_id, kind, title, body, link, actor_id, metadata)
       SELECT unnest($1::uuid[]), $2, $3, $4, $5, $6, $7
       RETURNING id, user_id`,
      [
        wanted,
        input.kind,
        input.title.slice(0, 200),
        input.body?.slice(0, 1000) ?? null,
        input.link ?? null,
        input.actorId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (!realtime.attached) return;

    const { rows: full } = await runner.query<Record<string, unknown>>(
      `${SELECT_NOTIFICATION} WHERE n.id = ANY($1::uuid[])`,
      [inserted.map((r) => r.id)],
    );
    for (const row of full) {
      const notification = mapNotification(row);
      realtime.toUser(row.user_id as string, 'notification:new', notification);
    }
    // Refresh each recipient's badge without a round trip.
    for (const userId of wanted) {
      void unreadCount(userId).then((unread) => realtime.toUser(userId, 'notification:count', { unread }));
    }
  } catch (err) {
    logger.error({ err, kind: input.kind }, 'failed to deliver notifications');
  }
}

export async function listNotifications(
  userId: string,
  opts: { limit: number; cursor?: string; unreadOnly: boolean; kind?: string[] },
): Promise<{ items: Notification[]; nextCursor: string | null }> {
  const params: unknown[] = [userId];
  let sql = `${SELECT_NOTIFICATION} WHERE n.user_id = $1`;

  if (opts.unreadOnly) sql += ` AND n.read_at IS NULL`;
  if (opts.kind?.length) {
    params.push(opts.kind);
    sql += ` AND n.kind = ANY($${params.length}::text[])`;
  }
  // Keyset pagination on created_at; cheaper and stable under inserts, unlike
  // OFFSET which shifts rows as new notifications arrive.
  if (opts.cursor) {
    params.push(opts.cursor);
    sql += ` AND n.created_at < $${params.length}`;
  }
  params.push(opts.limit + 1);
  sql += ` ORDER BY n.created_at DESC LIMIT $${params.length}`;

  const { rows } = await db().query<Record<string, unknown>>(sql, params);
  const hasMore = rows.length > opts.limit;
  const page = (hasMore ? rows.slice(0, opts.limit) : rows).map(mapNotification);
  const last = page[page.length - 1];
  return { items: page, nextCursor: hasMore && last ? last.createdAt : null };
}

export async function unreadCount(userId: string): Promise<number> {
  const { rows } = await db().query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

export async function markRead(userId: string, ids: string[] | undefined, all: boolean): Promise<number> {
  // Always scoped by user_id, so a caller cannot mark someone else's as read.
  const { rowCount } = all || !ids?.length
    ? await db().query(
        `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      )
    : await db().query(
        `UPDATE notifications SET read_at = now()
          WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::uuid[])`,
        [userId, ids],
      );

  const unread = await unreadCount(userId);
  realtime.toUser(userId, 'notification:count', { unread });
  return rowCount;
}

export async function deleteNotification(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await db().query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  return rowCount > 0;
}
