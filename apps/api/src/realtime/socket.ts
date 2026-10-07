import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  room, type ClientToServerEvents, type PresenceState, type ServerToClientEvents,
  type SocketAuthData,
} from '@xenospace/shared';
import { allowedOrigins, env, isProd } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { verifyAccessToken } from '../auth/tokens.js';
import { db } from '../db/index.js';
import { cache } from '../cache/index.js';

/**
 * Realtime transport.
 *
 * Sockets authenticate with the same short-lived access token as the REST API,
 * so there is one identity model rather than two. Room membership is authorized
 * server-side on every join: a socket may ask to subscribe to anything, and the
 * server decides.
 */

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketAuthData>;

let io: AppServer | null = null;

export function attachRealtime(httpServer: HttpServer): AppServer {
  const server: AppServer = new Server(httpServer, {
    path: '/realtime',
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    // Upgrade straight to WebSocket where possible; long-polling remains as the
    // fallback for restrictive networks.
    transports: ['websocket', 'polling'],
    pingInterval: 25_000,
    pingTimeout: 20_000,
    // Bounds a malicious client's per-message memory use.
    maxHttpBufferSize: 256 * 1024,
    connectionStateRecovery: {
      // Lets a brief disconnect resume without losing missed events, which is
      // what keeps a flaky connection from dropping chat messages.
      maxDisconnectionDuration: 60_000,
      skipMiddlewares: false,
    },
  });

  /**
   * Handshake authentication. An unauthenticated socket is rejected outright
   * rather than connected and limited, so there is no anonymous socket pool to
   * exhaust.
   */
  server.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth as { token?: unknown } | undefined)?.token ??
        socket.handshake.headers.authorization?.replace(/^[Bb]earer\s+/, '');
      if (typeof raw !== 'string' || !raw) return next(new Error('UNAUTHENTICATED'));

      const claims = await verifyAccessToken(raw);

      // The token's signature is valid, but the session behind it may have been
      // revoked since it was minted.
      const { rows } = await db().query<{ status: string }>(
        `SELECT u.status FROM users u
           JOIN sessions s ON s.user_id = u.id
          WHERE u.id = $1 AND s.family_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
          LIMIT 1`,
        [claims.sub, claims.sid],
      );
      if (rows[0]?.status !== 'ACTIVE') return next(new Error('UNAUTHENTICATED'));

      socket.data = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  server.on('connection', (socket) => {
    const { userId } = socket.data;

    // Every socket joins its own user room, which is how targeted events
    // (notifications, assignment) reach every device a person has open.
    void socket.join(room.user(userId));
    void socket.join(room.presence);

    logger.debug({ userId, socketId: socket.id }, 'socket connected');
    socket.emit('connection:ready', { userId, socketId: socket.id });

    void setPresence(server, userId, 'ONLINE');
    void sendPresenceSnapshot(socket);

    registerHandlers(server, socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, reason }, 'socket disconnected');
      // Presence only flips to offline once a user's last socket closes, so
      // opening a second tab does not make them appear offline.
      void (async () => {
        const sockets = await server.in(room.user(userId)).fetchSockets();
        if (sockets.length === 0) await setPresence(server, userId, 'OFFLINE');
      })();
    });
  });

  io = server;
  logger.info('realtime gateway attached');
  return server;
}

/** Per-socket event rate limit, so one client cannot flood a room. */
const EVENT_WINDOW_SECONDS = 10;
const EVENT_MAX = 100;

async function withinBudget(socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketAuthData>): Promise<boolean> {
  const hits = await cache.increment(`sock:${socket.id}`, EVENT_WINDOW_SECONDS);
  if (hits > EVENT_MAX) {
    logger.warn({ userId: socket.data.userId, socketId: socket.id, hits }, 'socket event flood — disconnecting');
    socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many events.' });
    socket.disconnect(true);
    return false;
  }
  return true;
}

function registerHandlers(
  server: AppServer,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketAuthData>,
): void {
  const { userId, role } = socket.data;

  socket.on('project:subscribe', async ({ projectId }, ack) => {
    if (!(await withinBudget(socket))) return;
    if (!isUuid(projectId)) return ack?.({ ok: false, code: 'VALIDATION_FAILED', message: 'Invalid project id' });

    // A team lead sees every project; a developer only the ones they belong to.
    const allowed = await canSeeProject(userId, role, projectId);
    if (!allowed) {
      ack?.({ ok: false, code: 'FORBIDDEN', message: 'No access to that project' });
      return;
    }
    await socket.join(room.project(projectId));
    ack?.({ ok: true });
  });

  socket.on('project:unsubscribe', ({ projectId }) => {
    if (isUuid(projectId)) void socket.leave(room.project(projectId));
  });

  socket.on('channel:subscribe', async ({ channelId }, ack) => {
    if (!(await withinBudget(socket))) return;
    if (!isUuid(channelId)) return ack?.({ ok: false, code: 'VALIDATION_FAILED', message: 'Invalid channel id' });

    const { rows } = await db().query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM channel_members WHERE channel_id = $1 AND user_id = $2
         UNION ALL
         SELECT 1 FROM channels WHERE id = $1 AND kind = 'PUBLIC'
       ) AS ok`,
      [channelId, userId],
    );
    if (!rows[0]?.ok) {
      ack?.({ ok: false, code: 'FORBIDDEN', message: 'No access to that channel' });
      return;
    }
    await socket.join(room.channel(channelId));
    ack?.({ ok: true });
  });

  socket.on('channel:unsubscribe', ({ channelId }) => {
    if (isUuid(channelId)) void socket.leave(room.channel(channelId));
  });

  socket.on('typing:set', async ({ channelId, isTyping }) => {
    if (!(await withinBudget(socket))) return;
    if (!isUuid(channelId)) return;
    // Only broadcast into a room the socket actually belongs to.
    if (!socket.rooms.has(room.channel(channelId))) return;

    const { rows } = await db().query(
      `SELECT id, email, name, role, status, avatar_url, avatar_color, job_title, presence, last_seen_at
         FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];
    if (!user) return;
    const { toPublicUser } = await import('../lib/serialize.js');
    socket.to(room.channel(channelId)).emit('typing:update', {
      channelId,
      user: toPublicUser(user as never),
      isTyping: Boolean(isTyping),
    });
  });

  socket.on('presence:set', async ({ state }) => {
    if (!(await withinBudget(socket))) return;
    if (!['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'].includes(state)) return;
    await setPresence(server, userId, state);
  });

  socket.on('channel:read', async ({ channelId, at }) => {
    if (!(await withinBudget(socket))) return;
    if (!isUuid(channelId)) return;
    const stamp = Number.isNaN(Date.parse(at)) ? new Date() : new Date(at);
    await db().query(
      `UPDATE channel_members SET last_read_at = $3
        WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId, stamp],
    );
  });
}

async function canSeeProject(userId: string, role: string, projectId: string): Promise<boolean> {
  if (role === 'ADMIN') {
    const { rows } = await db().query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM projects WHERE id = $1) AS ok`,
      [projectId],
    );
    return rows[0]?.ok === true;
  }
  const { rows } = await db().query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2
     ) AS ok`,
    [projectId, userId],
  );
  return rows[0]?.ok === true;
}

async function setPresence(server: AppServer, userId: string, state: PresenceState): Promise<void> {
  const { rows } = await db().query<{ last_seen_at: string }>(
    `UPDATE users SET presence = $2, last_seen_at = now() WHERE id = $1 RETURNING last_seen_at`,
    [userId, state],
  );
  const lastSeenAt = rows[0]?.last_seen_at ?? new Date().toISOString();
  server.to(room.presence).emit('presence:update', {
    userId,
    state,
    lastSeenAt: new Date(lastSeenAt).toISOString(),
  });
}

async function sendPresenceSnapshot(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketAuthData>,
): Promise<void> {
  const { rows } = await db().query<{ id: string; presence: PresenceState }>(
    `SELECT id, presence FROM users WHERE status = 'ACTIVE' AND presence <> 'OFFLINE' LIMIT 500`,
  );
  socket.emit(
    'presence:snapshot',
    rows.map((r) => ({ userId: r.id, state: r.presence })),
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/* ---------------------------------------------------------------- emitters */

/**
 * Typed emit helpers used by the service layer.
 *
 * Each is a no-op when the gateway is not attached, so the REST API stays
 * fully usable in tests and scripts without a socket server running.
 */
export const realtime = {
  toUser<E extends keyof ServerToClientEvents>(userId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    io?.to(room.user(userId)).emit(event, ...args);
  },
  toUsers<E extends keyof ServerToClientEvents>(userIds: string[], event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    if (!io || userIds.length === 0) return;
    io.to(userIds.map((id) => room.user(id))).emit(event, ...args);
  },
  toProject<E extends keyof ServerToClientEvents>(projectId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    io?.to(room.project(projectId)).emit(event, ...args);
  },
  toChannel<E extends keyof ServerToClientEvents>(channelId: string, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
    io?.to(room.channel(channelId)).emit(event, ...args);
  },
  /** Ends every socket for a user, e.g. after a forced sign-out or role change. */
  async disconnectUser(userId: string, reason: 'LOGOUT' | 'EXPIRED' | 'REVOKED' | 'ROLE_CHANGED'): Promise<void> {
    if (!io) return;
    io.to(room.user(userId)).emit('session:revoked', { reason });
    const sockets = await io.in(room.user(userId)).fetchSockets();
    for (const s of sockets) s.disconnect(true);
  },
  get attached(): boolean {
    return io !== null;
  },
};

/**
 * In production the Redis adapter is what makes rooms work across instances;
 * without it an event emitted on one pod never reaches a socket on another.
 */
export async function attachRedisAdapter(): Promise<void> {
  if (!io || !env.REDIS_URL) {
    if (isProd) logger.error('realtime is running without the redis adapter — events will not cross instances');
    return;
  }
  try {
    const [{ createAdapter }, { default: Redis }] = await Promise.all([
      import('@socket.io/redis-adapter'),
      import('ioredis'),
    ]);
    const pub = new Redis(env.REDIS_URL);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info('realtime using the redis adapter');
  } catch (err) {
    logger.error({ err }, 'failed to attach the redis adapter');
    if (isProd) throw err;
  }
}
