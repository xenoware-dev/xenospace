import http from 'node:http'

import app from '@/app'
import { connectDB, disconnectDB } from '@/config/db'
import { env } from '@/config/env'
import { initSocket } from '@/sockets/index'

async function main() {
  await connectDB()

  const httpServer = http.createServer(app)
  initSocket(httpServer)

  const server = httpServer.listen(env.PORT, () => {
    console.log(`Xenospace API listening on port ${env.PORT} [${env.NODE_ENV}]`)
  })

  const shutdown = async (signal: string) => {
    console.log(`${signal} received. Shutting down gracefully...`)
    server.close(async () => {
      await disconnectDB()
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
