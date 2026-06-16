/**
 * Production entrypoint for the integration sync worker poll loop.
 *
 * Usage:
 *   node scripts/sync-worker-daemon.js
 *   npm run sync-worker:start
 *
 * PM2 (see ecosystem.config.js):
 *   pm2 start ecosystem.config.js --only marketplace-sync-worker
 */
require('dotenv').config();

const { validateEnv } = require('../shared/config/validate-env');
const {
  startSyncWorker,
  stopSyncWorker,
  getWorkerId,
  SYNC_WORKER_POLL_INTERVAL_MS,
} = require('../shared/integration-sync');

let shuttingDown = false;

/**
 * @param {string} signal
 */
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[sync-worker-daemon] ${signal} received — graceful shutdown`);
  stopSyncWorker();
  console.log('[sync-worker-daemon] worker stopped');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
  validateEnv();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[sync-worker-daemon] environment validation failed:', message);
  process.exit(1);
}

const configuredInterval = Number(process.env.SYNC_WORKER_POLL_INTERVAL_MS);
const pollIntervalMs =
  Number.isFinite(configuredInterval) && configuredInterval > 0
    ? configuredInterval
    : SYNC_WORKER_POLL_INTERVAL_MS;

startSyncWorker({ intervalMs: pollIntervalMs });

console.log('[sync-worker-daemon] worker started', {
  workerId: getWorkerId(),
  pollIntervalMs,
  pid: process.pid,
  nodeEnv: process.env.NODE_ENV || 'development',
});
