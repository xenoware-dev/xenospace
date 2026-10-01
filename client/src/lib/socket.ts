import { io, type Socket } from 'socket.io-client'

/**
 * The app's single socket. The server authenticates the handshake from the
 * same httpOnly access-token cookie the REST API uses, so there is no token
 * to pass here — only `withCredentials`, which is what sends the cookie.
 */
let socket: Socket | null = null

export function connectSocket() {
  if (socket?.connected) return socket

  socket ??= io({
    withCredentials: true,
    // Vite proxies /socket.io through to the API in development, so the
    // default same-origin URL is right in both environments.
    autoConnect: false,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  })

  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}

export function getSocket() {
  return socket
}
