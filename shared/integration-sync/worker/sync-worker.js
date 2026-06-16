const os = require('os');
const crypto = require('crypto');
const { listTenants } = require('../../tenant/registry');
const { getTenantModels, getTenantConnection } = require('../../tenant/connection');
const {
  SYNC_NOOP_WORKER_DELAY_MS,
  SYNC_WORKER_POLL_INTERVAL_MS,
  SUPPORTED_CHUNK_PHASES,
} = require('../constants');
const {
  findClaimableJobs,
  acquireLease,
  getJob,
  updateJob,
  completeJob,
  renewHeartbeat,
} = require('../repositories/job-repository');
const { countUploadedBatches } = require('../repositories/batch-repository');
const { assertTransition } = require('../state-machine');
const { recordEvent } = require('../services/event-service');
const { processUploadedBatches } = require('../services/phase-batch-sync-service');
const { getActivePhasesFromJob } = require('../services/chunk-upload-service');

/** @type {string} */
const WORKER_ID = `sync-worker-${os.hostname()}-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;

/** @type {Set<string>} */
const processingJobs = new Set();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getWorkerId() {
  return WORKER_ID;
}

/**
 * @param {import('sequelize').Model} job
 */
function jobExpectsChunks(job) {
  if (job.job_type === 'products' || job.job_type === 'prices' || job.job_type === 'stock' || job.job_type === 'media') {
    return true;
  }

  const metadata = job.metadata;
  if (metadata && Array.isArray(metadata.phases) && metadata.phases.length > 0) {
    return true;
  }

  return getActivePhasesFromJob(job).length > 0;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 */
async function jobHasUploadedBatches(models, jobId) {
  for (const phase of SUPPORTED_CHUNK_PHASES) {
    const count = await countUploadedBatches(models, jobId, phase);
    if (count > 0) {
      return true;
    }
  }
  return false;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tenantId
 * @param {string} jobId
 */
async function processSyncJob(models, sequelize, tenantId, jobId) {
  const acquired = await acquireLease(models, jobId, WORKER_ID);
  if (!acquired) {
    return false;
  }

  const job = await getJob(models, jobId);
  if (!job || job.status === 'paused' || job.status === 'cancelled') {
    return false;
  }

  const hasBatches = await jobHasUploadedBatches(models, jobId);
  if (hasBatches || jobExpectsChunks(job)) {
    return processUploadedBatches(models, sequelize, tenantId, jobId, WORKER_ID);
  }

  const noopJob = await getJob(models, jobId);
  if (!noopJob || noopJob.status === 'paused' || noopJob.status === 'cancelled') {
    return false;
  }

  if ((noopJob.total_records || 0) > 0 || jobExpectsChunks(noopJob)) {
    return false;
  }

  if (noopJob.status === 'pending') {
    assertTransition(noopJob.status, 'running');
    const now = new Date();
    await updateJob(models, jobId, {
      status: 'running',
      started_at: noopJob.started_at || now,
      current_phase: 'done',
    });
    await recordEvent(models, {
      jobId,
      tenantId,
      eventType: 'job.started',
      detail: { workerId: WORKER_ID, noop: true },
    });
  } else if (noopJob.status === 'running') {
    await renewHeartbeat(models, jobId, WORKER_ID);
  }

  await sleep(SYNC_NOOP_WORKER_DELAY_MS);

  const latest = await getJob(models, jobId);
  if (!latest || latest.status === 'cancelled' || latest.status === 'paused') {
    return false;
  }

  assertTransition(latest.status, 'completed');
  await completeJob(models, jobId, { current_phase: 'done' });
  await recordEvent(models, {
    jobId,
    tenantId,
    eventType: 'job.completed',
    detail: { workerId: WORKER_ID, noop: true },
  });

  return true;
}

async function pollOnce() {
  for (const tenant of listTenants()) {
    try {
      const models = getTenantModels(tenant);
      const sequelize = getTenantConnection(tenant);
      const claimable = await findClaimableJobs(models, tenant.id);

      for (const job of claimable) {
        if (processingJobs.has(job.id)) {
          continue;
        }

        if (job.status === 'paused') {
          continue;
        }

        processingJobs.add(job.id);
        try {
          await processSyncJob(models, sequelize, tenant.id, job.id);
        } catch (error) {
          console.error('[integration-sync-worker] job processing error', {
            tenantId: tenant.id,
            jobId: job.id,
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          processingJobs.delete(job.id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("doesn't exist")) {
        console.error('[integration-sync-worker] tenant poll error', {
          tenantId: tenant.id,
          message,
        });
      }
    }
  }
}

/**
 * @param {{ intervalMs?: number }} [options]
 */
function startSyncWorker(options = {}) {
  if (pollTimer) {
    return { workerId: WORKER_ID, stop: stopSyncWorker };
  }

  const intervalMs = options.intervalMs ?? SYNC_WORKER_POLL_INTERVAL_MS;
  pollTimer = setInterval(() => {
    pollOnce().catch((error) => {
      console.error('[integration-sync-worker] poll error', {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  pollOnce().catch((error) => {
    console.error('[integration-sync-worker] initial poll error', {
      message: error instanceof Error ? error.message : String(error),
    });
  });

  if (typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }

  return { workerId: WORKER_ID, stop: stopSyncWorker };
}

function stopSyncWorker() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** @deprecated Use startSyncWorker */
const startNoOpWorker = startSyncWorker;

/** @deprecated Use stopSyncWorker */
const stopNoOpWorker = stopSyncWorker;

/** @deprecated */
async function processNoOpJob() {
  return false;
}

module.exports = {
  getWorkerId,
  processNoOpJob,
  processSyncJob,
  pollOnce,
  startSyncWorker,
  stopSyncWorker,
  startNoOpWorker,
  stopNoOpWorker,
};
