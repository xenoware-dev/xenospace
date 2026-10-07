import pino from 'pino';
import { env, isDev, isTest } from '../config/env.js';

/**
 * Fields that must never reach the logs. Pino redacts these by path at every
 * level, which is cheaper and more reliable than remembering to strip them at
 * each call site.
 */
const REDACTED = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'confirmPassword',
  'currentPassword',
  'accessToken',
  'refreshToken',
  'token',
  'totp',
  '*.password',
  '*.accessToken',
  '*.refreshToken',
  'body.password',
  'body.confirmPassword',
  'body.currentPassword',
  'body.accessToken',
  'body.refreshToken',
];

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTED, censor: '[redacted]' },
  base: { service: 'xenospace-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  // Human-readable output in dev; newline-delimited JSON everywhere else so a
  // log shipper can parse it.
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
