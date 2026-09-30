import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'

import { env, isProduction } from '@/config/env'
import { errorHandler, notFoundHandler } from '@/middleware/error.middleware'
import { globalLimiter } from '@/middleware/rateLimit.middleware'
import routes from '@/routes/index'

const app = express()

app.set('trust proxy', 1)

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
)

app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use(cookieParser())

if (!isProduction) {
  app.use(morgan('dev'))
}

app.use(globalLimiter)

app.use('/api/v1', routes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
