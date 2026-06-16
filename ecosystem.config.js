/**
 * PM2 ecosystem — Marketplace API + Integration Sync Worker.
 *
 * Usage (from api/ directory):
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 logs marketplace-sync-worker
 *
 * Ensure api/.env or EnvironmentFile provides DB + TENANT_REGISTRY_PATH (+ storage in production).
 */
const path = require('path');

const appDir = __dirname;

module.exports = {
  apps: [
    {
      name: 'marketplace-api',
      cwd: appDir,
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 3000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'marketplace-sync-worker',
      cwd: appDir,
      script: 'scripts/sync-worker-daemon.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '384M',
      restart_delay: 5000,
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
