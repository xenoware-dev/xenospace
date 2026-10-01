import { parseCookie } from 'cookie'
import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'

import { env } from '@/config/env'
import { verifyAccessToken } from '@/utils/token'

/**
 * The live connection. Held at module scope so any service can push to a
 * person without threading an `io` instance through every call site, and
 * nullable so the API still works when sockets are not up — a notification
 * that cannot be delivered live is still written to the database, and the
 * client picks it up on its next poll or page load.
 */
let io: Server | null = null

/** One room per person, so a push reaches every tab they have open. */
export function roomForUser(userId: string) {
  return `user:${userId}`
}

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
  })

  io.use((socket: Socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie
      const token = rawCookie ? parseCookie(rawCookie).accessToken : undefined

      if (!token) {
        next(new Error('Authentication required'))
        return
      }

      const payload = verifyAccessToken(token)
      socket.data.userId = payload.sub
      next()
    } catch {
      next(new Error('Authentication required'))
    }
  })

  io.on('connection', (socket) => {
    const userId = String(socket.data.userId)
    void socket.join(roomForUser(userId))

    socket.on('disconnect', () => {
      // Socket.IO leaves the room itself; nothing to unwind here.
    })
  })

  return io
}

/**
 * Pushes an event to one person's open tabs. Deliberately forgiving: a push
 * is a nice-to-have on top of a row that is already saved, so a socket that
 * is down must never fail the request that triggered it.
 */
export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return
  io.to(roomForUser(userId)).emit(event, payload)
}

export function getIO() {
  return io
}
