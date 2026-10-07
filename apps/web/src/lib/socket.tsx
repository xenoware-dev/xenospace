import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents, PresenceState, ServerToClientEvents,
} from '@xenospace/shared';
import { getAccessToken } from './api.js';
import { useAuth } from './auth.jsx';
import { keys, queryClient } from './queryClient.js';

/**
 * Realtime connection.
 *
 * One socket for the whole app, authenticated with the same access token as the
 * REST calls. Incoming events invalidate the specific caches they affect rather
 * than triggering a blanket refetch, which is what keeps a busy board from
 * re-requesting everything on every keystroke someone else makes.
 */

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextValue {
  socket: AppSocket | null;
  connected: boolean;
  /** Presence by user id, kept in a map so avatars can read it cheaply. */
  presence: Map<string, PresenceState>;
  /** Users currently typing, keyed by channel. */
  typing: Map<string, string[]>;
  subscribeProject: (projectId: string) => () => void;
  subscribeChannel: (channelId: string) => () => void;
  setTyping: (channelId: string, isTyping: boolean) => void;
  setPresence: (state: PresenceState) => void;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }): ReactNode {
  const { status, user } = useAuth();
  const socketRef = useRef<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [presence, setPresenceMap] = useState<Map<string, PresenceState>>(new Map());
  const [typing, setTypingMap] = useState<Map<string, string[]>>(new Map());
  // Timers that clear a typing indicator if the stop event never arrives.
  const typingTimers = useRef(new Map<string, number>());

  useEffect(() => {
    if (status !== 'authenticated' || !user) return;

    // In production the site is on Vercel and the API on Railway. Vercel's
    // rewrites cannot carry a WebSocket, so the socket connects to the API
    // host directly; locally it goes through Vite's proxy on the same origin.
    // Auth is a token in the handshake, not a cookie, so cross-origin is fine.
    const realtimeUrl = import.meta.env.VITE_REALTIME_URL as string | undefined;
    const options = {
      path: '/realtime',
      // The token is read lazily at connect time, so a reconnect after a
      // refresh presents the new token rather than the expired one.
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 10_000,
    } satisfies Parameters<typeof io>[1];
    const socket: AppSocket = realtimeUrl ? io(realtimeUrl, options) : io(options);
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    /* ----------------------------------------------------------- presence */

    socket.on('presence:snapshot', (entries) => {
      setPresenceMap(new Map(entries.map((e) => [e.userId, e.state])));
    });
    socket.on('presence:update', ({ userId, state }) => {
      setPresenceMap((prev) => new Map(prev).set(userId, state));
    });

    /* ------------------------------------------------------- notifications */

    socket.on('notification:new', () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('notification:count', ({ unread }) => {
      queryClient.setQueryData(keys.unreadCount, { unread });
    });

    /* -------------------------------------------------------------- work */

    const invalidateTasks = () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    // A GitHub sync can change repositories, code reviews and task links.
    socket.on('repo:synced', () => {
      void queryClient.invalidateQueries({ queryKey: ['repos'] });
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
    socket.on('task:created', invalidateTasks);
    socket.on('task:deleted', invalidateTasks);
    socket.on('task:updated', ({ task }) => {
      // Seed the detail cache from the event so opening the task is instant.
      queryClient.setQueryData(keys.task(task.id), task);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });
    socket.on('task:moved', ({ actorId }) => {
      // The mover already applied this optimistically; refetching would fight
      // their own drag animation.
      if (actorId === user.id) return;
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socket.on('issue:created', () => void queryClient.invalidateQueries({ queryKey: ['issues'] }));
    socket.on('issue:updated', ({ issue }) => {
      queryClient.setQueryData(keys.issue(issue.id), issue);
      void queryClient.invalidateQueries({ queryKey: ['issues'] });
    });

    socket.on('deployment:updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['deployments'] });
    });
    socket.on('activity:new', () => {
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    });

    /* -------------------------------------------------------------- chat */

    socket.on('message:new', (message) => {
      void queryClient.invalidateQueries({ queryKey: keys.messages(message.channelId) });
      void queryClient.invalidateQueries({ queryKey: keys.channels });
    });
    socket.on('message:updated', (message) => {
      void queryClient.invalidateQueries({ queryKey: keys.messages(message.channelId) });
    });
    socket.on('message:deleted', ({ channelId }) => {
      void queryClient.invalidateQueries({ queryKey: keys.messages(channelId) });
    });
    socket.on('message:reaction', ({ channelId }) => {
      void queryClient.invalidateQueries({ queryKey: keys.messages(channelId) });
    });

    socket.on('typing:update', ({ channelId, user: typingUser, isTyping }) => {
      const timerKey = `${channelId}:${typingUser.id}`;
      setTypingMap((prev) => {
        const next = new Map(prev);
        const current = next.get(channelId) ?? [];
        next.set(
          channelId,
          isTyping
            ? current.includes(typingUser.name) ? current : [...current, typingUser.name]
            : current.filter((n) => n !== typingUser.name),
        );
        return next;
      });

      const existing = typingTimers.current.get(timerKey);
      if (existing) window.clearTimeout(existing);
      if (isTyping) {
        // Self-expiring, so a dropped "stopped typing" does not leave the
        // indicator stuck on forever.
        typingTimers.current.set(
          timerKey,
          window.setTimeout(() => {
            setTypingMap((prev) => {
              const next = new Map(prev);
              next.set(channelId, (next.get(channelId) ?? []).filter((n) => n !== typingUser.name));
              return next;
            });
          }, 5000),
        );
      }
    });

    socket.on('session:revoked', () => {
      // The server ended this session; the auth layer's next request will
      // observe the 401 and clear state.
      socket.disconnect();
    });

    return () => {
      for (const timer of typingTimers.current.values()) window.clearTimeout(timer);
      typingTimers.current.clear();
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [status, user]);

  /** Joins a project room and returns the matching leave function. */
  const subscribeProject = useCallback((projectId: string) => {
    socketRef.current?.emit('project:subscribe', { projectId });
    return () => socketRef.current?.emit('project:unsubscribe', { projectId });
  }, []);

  const subscribeChannel = useCallback((channelId: string) => {
    socketRef.current?.emit('channel:subscribe', { channelId });
    return () => socketRef.current?.emit('channel:unsubscribe', { channelId });
  }, []);

  const setTyping = useCallback((channelId: string, isTyping: boolean) => {
    socketRef.current?.emit('typing:set', { channelId, isTyping });
  }, []);

  const setPresenceState = useCallback((state: PresenceState) => {
    socketRef.current?.emit('presence:set', { state });
  }, []);

  const value = useMemo<SocketContextValue>(
    () => ({
      socket: socketRef.current,
      connected,
      presence,
      typing,
      subscribeProject,
      subscribeChannel,
      setTyping,
      setPresence: setPresenceState,
    }),
    [connected, presence, typing, subscribeProject, subscribeChannel, setTyping, setPresenceState],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside a SocketProvider');
  return context;
}

/** Joins a project room for the lifetime of the component. */
export function useProjectRoom(projectId: string | undefined): void {
  const { subscribeProject, connected } = useSocket();
  useEffect(() => {
    if (!projectId || !connected) return;
    return subscribeProject(projectId);
  }, [projectId, connected, subscribeProject]);
}

export function useChannelRoom(channelId: string | undefined): void {
  const { subscribeChannel, connected } = useSocket();
  useEffect(() => {
    if (!channelId || !connected) return;
    return subscribeChannel(channelId);
  }, [channelId, connected, subscribeChannel]);
}
