import type { Channel, ChatMessage, PublicUser, StoredFile } from '@xenospace/shared';
import { db, type Queryable } from '../../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import { iso, nestedUser, userJoinColumns } from '../../lib/serialize.js';
import { notify } from '../notifications/notifications.service.js';
import { realtime } from '../../realtime/socket.js';
import type { Principal } from '../../middleware/authenticate.js';
import { assertProjectAccess, isAdmin } from '../common/access.js';

/**
 * Team chat.
 *
 * Membership is the authorization boundary: every read and write checks that
 * the actor belongs to the channel (or that it is public), so a channel id is
 * never enough on its own to reach a conversation.
 */

async function assertChannelAccess(
  actor: Principal,
  channelId: string,
  opts: { requireMembership?: boolean } = {},
  tx?: Queryable,
): Promise<{ kind: string; projectId: string | null; name: string }> {
  const runner = tx ?? db();
  const { rows } = await runner.query<{ kind: string; project_id: string | null; name: string; is_member: boolean }>(
    `SELECT c.kind, c.project_id, c.name,
            EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2) AS is_member
       FROM channels c WHERE c.id = $1`,
    [channelId, actor.id],
  );
  const row = rows[0];
  if (!row) throw notFound('Channel');

  // A public channel is readable workspace-wide; private and direct channels
  // require membership, and an admin is not exempt from a direct message.
  const canSee = row.is_member || (row.kind === 'PUBLIC' && !opts.requireMembership);
  if (!canSee) throw notFound('Channel');

  return { kind: row.kind, projectId: row.project_id, name: row.name };
}

export async function listChannels(actor: Principal): Promise<Channel[]> {
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT c.id, c.name, c.topic, c.kind, c.project_id, c.created_at,
            cm.last_read_at,
            (SELECT count(*)::int FROM channel_members x WHERE x.channel_id = c.id) AS member_count,
            (SELECT count(*)::int FROM messages m
               WHERE m.channel_id = c.id AND m.deleted_at IS NULL
                 AND m.author_id <> $1
                 AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)) AS unread_count
       FROM channels c
       LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = $1
      WHERE c.archived_at IS NULL
        AND (cm.user_id IS NOT NULL OR c.kind = 'PUBLIC')
      ORDER BY CASE c.kind WHEN 'DIRECT' THEN 1 ELSE 0 END, c.name`,
    [actor.id],
  );

  const channels: Channel[] = rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    topic: (row.topic as string | null) ?? null,
    kind: row.kind as Channel['kind'],
    projectId: (row.project_id as string | null) ?? null,
    memberCount: (row.member_count as number) ?? 0,
    unreadCount: (row.unread_count as number) ?? 0,
    lastMessage: null,
    lastReadAt: iso(row.last_read_at as string | null),
    createdAt: iso(row.created_at as string)!,
  }));

  await attachLastMessages(channels);
  await attachDirectNames(actor, channels);
  return channels;
}

/** Newest message per channel, fetched in one windowed query. */
async function attachLastMessages(channels: Channel[]): Promise<void> {
  if (channels.length === 0) return;
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT * FROM (
       SELECT m.id, m.channel_id, m.client_id, m.body, m.parent_id, m.mentions,
              m.edited_at, m.deleted_at, m.created_at,
              ${userJoinColumns('u', 'author')},
              row_number() OVER (PARTITION BY m.channel_id ORDER BY m.created_at DESC) AS rn
         FROM messages m LEFT JOIN users u ON u.id = m.author_id
        WHERE m.channel_id = ANY($1::uuid[]) AND m.deleted_at IS NULL
     ) ranked WHERE rn = 1`,
    [channels.map((c) => c.id)],
  );
  const byChannel = new Map(rows.map((r) => [r.channel_id as string, mapMessage(r)]));
  for (const channel of channels) channel.lastMessage = byChannel.get(channel.id) ?? null;
}

/**
 * A direct channel is named after the other participants, not its stored name,
 * so each person sees who they are talking to.
 */
async function attachDirectNames(actor: Principal, channels: Channel[]): Promise<void> {
  const directs = channels.filter((c) => c.kind === 'DIRECT');
  if (directs.length === 0) return;

  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT cm.channel_id, ${userJoinColumns('u', 'u')}
       FROM channel_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.channel_id = ANY($1::uuid[]) AND cm.user_id <> $2`,
    [directs.map((c) => c.id), actor.id],
  );
  const byChannel = new Map<string, PublicUser[]>();
  for (const row of rows) {
    const list = byChannel.get(row.channel_id as string) ?? [];
    const user = nestedUser(row, 'u');
    if (user) list.push(user);
    byChannel.set(row.channel_id as string, list);
  }
  for (const channel of directs) {
    const others = byChannel.get(channel.id) ?? [];
    if (others.length > 0) {
      channel.name = others.map((u) => u.name).join(', ');
      channel.members = others;
    }
  }
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    clientId: (row.client_id as string | null) ?? null,
    author: nestedUser(row, 'author') ?? {
      id: 'unknown', name: 'Former member', email: '', role: 'DEVELOPER', status: 'DEACTIVATED',
      avatarUrl: null, avatarColor: '#94a3b8', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
    },
    // A deleted message leaves a tombstone so the thread does not reshuffle.
    body: deleted ? '' : (row.body as string),
    parentId: (row.parent_id as string | null) ?? null,
    replyCount: (row.reply_count as number) ?? 0,
    mentions: (row.mentions as string[]) ?? [],
    attachments: (row.attachments as StoredFile[]) ?? [],
    reactions: (row.reactions as ChatMessage['reactions']) ?? [],
    editedAt: iso(row.edited_at as string | null),
    deletedAt: iso(row.deleted_at as string | null),
    createdAt: iso(row.created_at as string)!,
  };
}

export async function createChannel(actor: Principal, input: Record<string, unknown>): Promise<Channel> {
  if (input.projectId) await assertProjectAccess(actor, input.projectId as string);

  const id = await db().transaction(async (tx) => {
    const { rows: clash } = await tx.query<{ id: string }>(
      `SELECT id FROM channels WHERE lower(name) = lower($1) AND kind <> 'DIRECT'`,
      [input.name as string],
    );
    if (clash.length) throw conflict('A channel with that name already exists.');

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO channels (name, topic, kind, project_id, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.name, input.topic ?? null, input.kind ?? 'PUBLIC', input.projectId ?? null, actor.id],
    );
    const channelId = rows[0]!.id;

    const members = new Set([actor.id, ...((input.memberIds as string[]) ?? [])]);
    for (const userId of members) {
      await tx.query(
        `INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [channelId, userId],
      );
    }
    return channelId;
  });

  const channels = await listChannels(actor);
  return channels.find((c) => c.id === id)!;
}

/**
 * Finds or creates the direct channel between two people.
 *
 * Idempotent: asking twice returns the same conversation rather than creating a
 * duplicate, which is what makes the "message this person" button safe to press
 * repeatedly.
 */
export async function openDirectChannel(actor: Principal, otherUserId: string): Promise<Channel> {
  if (otherUserId === actor.id) throw badRequest('You cannot open a direct message with yourself.');

  const id = await db().transaction(async (tx) => {
    const { rows: user } = await tx.query<{ name: string }>(
      `SELECT name FROM users WHERE id = $1 AND status = 'ACTIVE'`,
      [otherUserId],
    );
    if (!user[0]) throw notFound('User');

    // A direct channel is identified by having exactly these two members.
    const { rows: existing } = await tx.query<{ id: string }>(
      `SELECT c.id FROM channels c
        WHERE c.kind = 'DIRECT'
          AND (SELECT count(*) FROM channel_members cm WHERE cm.channel_id = c.id) = 2
          AND EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $1)
          AND EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = $2)
        LIMIT 1`,
      [actor.id, otherUserId],
    );
    if (existing[0]) return existing[0].id;

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO channels (name, kind, created_by) VALUES ($1, 'DIRECT', $2) RETURNING id`,
      [`dm:${[actor.id, otherUserId].sort().join(':')}`, actor.id],
    );
    const channelId = rows[0]!.id;
    for (const userId of [actor.id, otherUserId]) {
      await tx.query(`INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2)`, [channelId, userId]);
    }
    return channelId;
  });

  const channels = await listChannels(actor);
  return channels.find((c) => c.id === id)!;
}

export async function joinChannel(actor: Principal, channelId: string): Promise<void> {
  const channel = await assertChannelAccess(actor, channelId);
  // Private and direct channels are joined by invitation, not self-service.
  if (channel.kind !== 'PUBLIC') throw forbidden('This channel is invitation only.');
  await db().query(
    `INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [channelId, actor.id],
  );
}

export async function leaveChannel(actor: Principal, channelId: string): Promise<void> {
  await db().query(`DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2`, [channelId, actor.id]);
}

export async function addMembers(actor: Principal, channelId: string, userIds: string[]): Promise<void> {
  await assertChannelAccess(actor, channelId, { requireMembership: true });
  for (const userId of userIds.slice(0, 100)) {
    await db().query(
      `INSERT INTO channel_members (channel_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [channelId, userId],
    );
  }
}

export async function listMessages(
  actor: Principal,
  channelId: string,
  opts: { limit: number; cursor?: string },
): Promise<{ items: ChatMessage[]; nextCursor: string | null }> {
  await assertChannelAccess(actor, channelId);

  const params: unknown[] = [channelId];
  let sql = `
    SELECT m.id, m.channel_id, m.client_id, m.body, m.parent_id, m.mentions,
           m.edited_at, m.deleted_at, m.created_at,
           ${userJoinColumns('u', 'author')},
           (SELECT count(*)::int FROM messages r WHERE r.parent_id = m.id AND r.deleted_at IS NULL) AS reply_count
      FROM messages m LEFT JOIN users u ON u.id = m.author_id
     WHERE m.channel_id = $1 AND m.parent_id IS NULL`;

  // Keyset pagination backwards through history.
  if (opts.cursor) {
    params.push(opts.cursor);
    sql += ` AND m.created_at < $${params.length}`;
  }
  params.push(opts.limit + 1);
  sql += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

  const { rows } = await db().query<Record<string, unknown>>(sql, params);
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const messages = page.map(mapMessage);

  await attachReactions(messages);
  await attachAttachments(messages);

  const last = messages[messages.length - 1];
  return {
    // Reversed so the client renders oldest-first within the page.
    items: messages.reverse(),
    nextCursor: hasMore && last ? last.createdAt : null,
  };
}

export async function listThread(actor: Principal, channelId: string, parentId: string): Promise<ChatMessage[]> {
  await assertChannelAccess(actor, channelId);
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT m.id, m.channel_id, m.client_id, m.body, m.parent_id, m.mentions,
            m.edited_at, m.deleted_at, m.created_at, ${userJoinColumns('u', 'author')}
       FROM messages m LEFT JOIN users u ON u.id = m.author_id
      WHERE m.channel_id = $1 AND (m.id = $2 OR m.parent_id = $2)
      ORDER BY m.created_at ASC LIMIT 500`,
    [channelId, parentId],
  );
  const messages = rows.map(mapMessage);
  await attachReactions(messages);
  await attachAttachments(messages);
  return messages;
}

async function attachReactions(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const { rows } = await db().query<{ message_id: string; emoji: string; user_ids: string[] }>(
    `SELECT message_id, emoji, array_agg(user_id::text) AS user_ids
       FROM message_reactions WHERE message_id = ANY($1::uuid[])
      GROUP BY message_id, emoji`,
    [messages.map((m) => m.id)],
  );
  const byMessage = new Map<string, ChatMessage['reactions']>();
  for (const row of rows) {
    const list = byMessage.get(row.message_id) ?? [];
    list.push({ emoji: row.emoji, count: row.user_ids.length, userIds: row.user_ids });
    byMessage.set(row.message_id, list);
  }
  for (const message of messages) message.reactions = byMessage.get(message.id) ?? [];
}

async function attachAttachments(messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT ma.message_id, f.id, f.name, f.mime_type, f.size_bytes, f.storage_key,
            f.folder, f.description, f.visibility, f.project_id, f.created_at
       FROM message_attachments ma JOIN files f ON f.id = ma.file_id
      WHERE ma.message_id = ANY($1::uuid[]) AND f.deleted_at IS NULL`,
    [messages.map((m) => m.id)],
  );
  const byMessage = new Map<string, StoredFile[]>();
  for (const row of rows) {
    const list = byMessage.get(row.message_id as string) ?? [];
    list.push({
      id: row.id as string,
      projectId: (row.project_id as string | null) ?? null,
      name: row.name as string,
      mimeType: row.mime_type as string,
      sizeBytes: Number(row.size_bytes),
      url: `/api/v1/files/${row.id as string}/download`,
      thumbnailUrl: null,
      folder: (row.folder as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      visibility: row.visibility as StoredFile['visibility'],
      uploadedBy: {
        id: 'unknown', name: '', email: '', role: 'DEVELOPER', status: 'ACTIVE',
        avatarUrl: null, avatarColor: '#64748b', jobTitle: null, presence: 'OFFLINE', lastSeenAt: null,
      },
      createdAt: iso(row.created_at as string)!,
    });
    byMessage.set(row.message_id as string, list);
  }
  for (const message of messages) message.attachments = byMessage.get(message.id) ?? [];
}

/**
 * Posts a message.
 *
 * `clientId` makes the write idempotent: a retry after a dropped response
 * returns the message already stored rather than duplicating it, which is what
 * lets the client retry safely behind an optimistic bubble.
 */
export async function sendMessage(
  actor: Principal,
  channelId: string,
  input: { body: string; clientId: string; parentId?: string | null; mentions: string[]; attachmentIds: string[] },
): Promise<ChatMessage> {
  await assertChannelAccess(actor, channelId, { requireMembership: true });

  const id = await db().transaction(async (tx) => {
    const { rows: existing } = await tx.query<{ id: string }>(
      `SELECT id FROM messages WHERE channel_id = $1 AND client_id = $2`,
      [channelId, input.clientId],
    );
    if (existing[0]) return existing[0].id;

    if (input.parentId) {
      const { rows: parent } = await tx.query<{ channel_id: string }>(
        `SELECT channel_id FROM messages WHERE id = $1`,
        [input.parentId],
      );
      if (parent[0]?.channel_id !== channelId) throw badRequest('That message is not in this channel.');
    }

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO messages (channel_id, author_id, body, client_id, parent_id, mentions)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [channelId, actor.id, input.body, input.clientId, input.parentId ?? null, input.mentions],
    );
    const messageId = rows[0]!.id;

    for (const fileId of input.attachmentIds.slice(0, 10)) {
      // Scoped to the uploader, so a message cannot attach someone else's file.
      await tx.query(
        `INSERT INTO message_attachments (message_id, file_id)
         SELECT $1, id FROM files WHERE id = $2 AND uploaded_by = $3 AND deleted_at IS NULL`,
        [messageId, fileId, actor.id],
      );
    }

    // Posting marks the channel read for the sender.
    await tx.query(
      `UPDATE channel_members SET last_read_at = now() WHERE channel_id = $1 AND user_id = $2`,
      [channelId, actor.id],
    );
    return messageId;
  });

  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT m.id, m.channel_id, m.client_id, m.body, m.parent_id, m.mentions,
            m.edited_at, m.deleted_at, m.created_at, ${userJoinColumns('u', 'author')}
       FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.id = $1`,
    [id],
  );
  const message = mapMessage(rows[0]!);
  await attachAttachments([message]);

  realtime.toChannel(channelId, 'message:new', message);

  const channel = await assertChannelAccess(actor, channelId);
  // Mentions get a notification; everyone else relies on the unread badge,
  // except in a direct message where the message *is* the notification.
  await notify({
    userIds: input.mentions, kind: 'MENTION',
    title: `${actor.name} mentioned you in ${channel.kind === 'DIRECT' ? 'a direct message' : `#${channel.name}`}`,
    body: input.body.slice(0, 140), link: `/chat/${channelId}`, actorId: actor.id,
  });

  if (channel.kind === 'DIRECT') {
    const { rows: others } = await db().query<{ user_id: string }>(
      `SELECT user_id FROM channel_members WHERE channel_id = $1 AND user_id <> $2`,
      [channelId, actor.id],
    );
    await notify({
      userIds: others.map((o) => o.user_id).filter((uid) => !input.mentions.includes(uid)),
      kind: 'CHANNEL_MESSAGE',
      title: `New message from ${actor.name}`,
      body: input.body.slice(0, 140), link: `/chat/${channelId}`, actorId: actor.id,
    });
  }

  return message;
}

export async function editMessage(actor: Principal, channelId: string, messageId: string, body: string): Promise<ChatMessage> {
  await assertChannelAccess(actor, channelId, { requireMembership: true });
  // Only the author may edit; an admin may delete but never rewrite.
  const { rowCount } = await db().query(
    `UPDATE messages SET body = $4, edited_at = now()
      WHERE id = $1 AND channel_id = $2 AND author_id = $3 AND deleted_at IS NULL`,
    [messageId, channelId, actor.id, body],
  );
  if (rowCount === 0) throw notFound('Message');

  const { rows } = await db().query<Record<string, unknown>>(
    `SELECT m.id, m.channel_id, m.client_id, m.body, m.parent_id, m.mentions,
            m.edited_at, m.deleted_at, m.created_at, ${userJoinColumns('u', 'author')}
       FROM messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.id = $1`,
    [messageId],
  );
  const message = mapMessage(rows[0]!);
  realtime.toChannel(channelId, 'message:updated', message);
  return message;
}

export async function deleteMessage(actor: Principal, channelId: string, messageId: string): Promise<void> {
  await assertChannelAccess(actor, channelId, { requireMembership: true });

  // Soft delete keeps thread structure and the audit trail intact.
  const canDeleteAny = isAdmin(actor);
  const { rowCount } = await db().query(
    `UPDATE messages SET deleted_at = now(), body = ''
      WHERE id = $1 AND channel_id = $2 AND deleted_at IS NULL
        ${canDeleteAny ? '' : 'AND author_id = $3'}`,
    canDeleteAny ? [messageId, channelId] : [messageId, channelId, actor.id],
  );
  if (rowCount === 0) throw notFound('Message');
  realtime.toChannel(channelId, 'message:deleted', { messageId, channelId });
}

/** Adds or removes a reaction; pressing the same emoji twice toggles it off. */
export async function toggleReaction(
  actor: Principal,
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<{ emoji: string; count: number; userIds: string[] }> {
  await assertChannelAccess(actor, channelId, { requireMembership: true });

  const { rowCount } = await db().query(
    `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, actor.id, emoji],
  );
  if (rowCount === 0) {
    await db().query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       SELECT $1, $2, $3 FROM messages WHERE id = $1 AND channel_id = $4
       ON CONFLICT DO NOTHING`,
      [messageId, actor.id, emoji, channelId],
    );
  }

  const { rows } = await db().query<{ user_ids: string[] }>(
    `SELECT array_agg(user_id::text) AS user_ids FROM message_reactions
      WHERE message_id = $1 AND emoji = $2`,
    [messageId, emoji],
  );
  const userIds = rows[0]?.user_ids ?? [];
  const payload = { emoji, count: userIds.length, userIds };
  realtime.toChannel(channelId, 'message:reaction', { messageId, channelId, ...payload });
  return payload;
}

export async function markRead(actor: Principal, channelId: string): Promise<void> {
  await assertChannelAccess(actor, channelId);
  await db().query(
    `INSERT INTO channel_members (channel_id, user_id, last_read_at) VALUES ($1,$2,now())
     ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read_at = now()`,
    [channelId, actor.id],
  );
}
