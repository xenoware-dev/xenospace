/**
 * Socket.IO contract. Both sides import these maps so an event name or payload
 * can never drift between emitter and listener.
 */
import type {
  ActivityEntry, ChatMessage, Deployment, Issue, Notification, PublicUser, Task,
} from './types.js';
import type { PresenceState, TaskStatus } from './domain.js';

/** Rooms a socket may join. Membership is authorized server-side on join. */
export const room = {
  user: (userId: string) => `user:${userId}`,
  project: (projectId: string) => `project:${projectId}`,
  channel: (channelId: string) => `channel:${channelId}`,
  presence: 'presence',
} as const;

export interface ServerToClientEvents {
  'connection:ready': (p: { userId: string; socketId: string }) => void;

  'notification:new': (p: Notification) => void;
  'notification:count': (p: { unread: number }) => void;

  'task:created': (p: { task: Task }) => void;
  'task:updated': (p: { task: Task; changedFields: string[] }) => void;
  'task:moved': (p: { taskId: string; projectId: string; from: TaskStatus; to: TaskStatus; position: number; actorId: string }) => void;
  'task:deleted': (p: { taskId: string; projectId: string }) => void;

  'issue:created': (p: { issue: Issue }) => void;
  'issue:updated': (p: { issue: Issue }) => void;

  'message:new': (p: ChatMessage) => void;
  'message:updated': (p: ChatMessage) => void;
  'message:deleted': (p: { messageId: string; channelId: string }) => void;
  'message:reaction': (p: { messageId: string; channelId: string; emoji: string; count: number; userIds: string[] }) => void;

  'typing:update': (p: { channelId: string; user: PublicUser; isTyping: boolean }) => void;
  'presence:update': (p: { userId: string; state: PresenceState; lastSeenAt: string }) => void;
  'presence:snapshot': (p: Array<{ userId: string; state: PresenceState }>) => void;

  'deployment:updated': (p: { deployment: Deployment }) => void;
  /** A repository finished syncing with GitHub (or failed to); refetch its data. */
  'repo:synced': (p: { repositoryId: string; projectId: string }) => void;
  'activity:new': (p: ActivityEntry) => void;

  /** Emitted before the server closes the socket, so the client can stop retrying. */
  'session:revoked': (p: { reason: 'LOGOUT' | 'EXPIRED' | 'REVOKED' | 'ROLE_CHANGED' }) => void;
  'error': (p: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'project:subscribe': (p: { projectId: string }, ack?: (r: AckResult) => void) => void;
  'project:unsubscribe': (p: { projectId: string }) => void;
  'channel:subscribe': (p: { channelId: string }, ack?: (r: AckResult) => void) => void;
  'channel:unsubscribe': (p: { channelId: string }) => void;
  'typing:set': (p: { channelId: string; isTyping: boolean }) => void;
  'presence:set': (p: { state: PresenceState }) => void;
  'channel:read': (p: { channelId: string; at: string }) => void;
}

export type AckResult = { ok: true } | { ok: false; code: string; message: string };

/** Data the auth middleware attaches to each socket after verifying its token. */
export interface SocketAuthData {
  userId: string;
  role: string;
  sessionId: string;
}
