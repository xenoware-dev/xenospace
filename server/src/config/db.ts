import mongoose from 'mongoose'

import { env } from '@/config/env'

mongoose.set('strictQuery', true)

export async function connectDB() {
  try {
    const conn = await mongoose.connect(env.MONGO_URI)
    console.log(`MongoDB connected: ${conn.connection.host}`)
  } catch (error) {
    console.error('MongoDB connection failed:', error)
    process.exit(1)
  }
}

export async function disconnectDB() {
  await mongoose.disconnect()
}
