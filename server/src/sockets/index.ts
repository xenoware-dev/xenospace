import { parseCookie } from 'cookie'
import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'

import { env } from '@/config/env'
import { verifyAccessToken } from '@/utils/token'

// Foundational Socket.IO bootstrap: authenticates the connection using the
// same access token cookie as the REST API. Feature events (messages,
// presence, live task updates) are added in later phases.
export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
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
    console.log(`Socket connected: user=${socket.data.userId} socket=${socket.id}`)

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: user=${socket.data.userId} socket=${socket.id}`)
    })
  })

  return io
}
