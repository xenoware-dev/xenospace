import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { closeDb, getDb } from './db/index.js';
import { closeCache, initCache } from './cache/index.js';
import { migrate } from './db/migrate.js';
import { reconcileAdminRoles } from './auth/adminPolicy.js';
import { startGitHubSync, stopGitHubSync } from './modules/repos/repos.sync.js';

/**
 * Server bootstrap.
 *
 * Dependencies are connected before the port is bound, so an instance never
 * accepts a request it cannot serve — which is what makes the readiness probe
 * meaningful to a load balancer.
 */
async function main(): Promise<void> {
  await getDb();

  // Migrating on boot keeps a single instance self-sufficient. With several
  // replicas this should move to a release step; the migration ledger makes a
  // concurrent attempt a no-op rather than a corruption.
  const { applied } = await migrate();
  if (applied.length) logger.info({ applied }, 'database migrated on boot');
  await reconcileAdminRoles(await getDb());

  await initCache();

  const app = createApp();
  const server = createServer(app);

  // Slightly above a typical 60s ALB idle timeout, so the proxy closes idle
  // connections first and clients never see a mid-request reset.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 30_000;

  const { attachRealtime, attachRedisAdapter } = await import('./realtime/socket.js');
  const io = attachRealtime(server);
  await attachRedisAdapter();

  await new Promise<void>((resolve) => server.listen(env.PORT, env.HOST, resolve));
  logger.info({ port: env.PORT, host: env.HOST, env: env.NODE_ENV }, 'xenospace api listening');
  startGitHubSync();

  /**
   * Graceful shutdown. In-flight requests are allowed to finish before the
   * database closes, otherwise a deploy turns every active request into a 500.
   */
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    stopGitHubSync();

    const forced = setTimeout(() => {
      logger.error('graceful shutdown timed out — exiting');
      process.exit(1);
    }, 15_000);
    forced.unref();

    try {
      await io.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await closeCache();
      await closeDb();
      clearTimeout(forced);
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state; log it and
  // let the orchestrator restart rather than limping on.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    void shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
