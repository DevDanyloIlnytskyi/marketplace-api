const { fn, col, Op } = require('sequelize');
const { SYNC_PHASES } = require('../constants');

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {Record<string, unknown>} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createBatch(models, data, options = {}) {
  return models.IntegrationSyncJobBatch.create(data, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {string} phase
 * @param {number} batchIndex
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function getBatch(models, jobId, phase, batchIndex, options = {}) {
  return models.IntegrationSyncJobBatch.findOne({
    where: { job_id: jobId, phase, batch_index: batchIndex },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number} batchId
 * @param {Record<string, unknown>} patch
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function updateBatch(models, batchId, patch, options = {}) {
  const now = new Date();
  return models.IntegrationSyncJobBatch.update(
    { ...patch, updated_at: now },
    {
      where: { id: batchId },
      transaction: options.transaction,
    },
  );
}

/**
 * Atomically claim an uploaded batch for processing.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number} batchId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<boolean>}
 */
async function claimBatchForProcessing(models, batchId, options = {}) {
  const now = new Date();
  const [updated] = await models.IntegrationSyncJobBatch.update(
    {
      status: 'processing',
      started_at: now,
      updated_at: now,
    },
    {
      where: {
        id: batchId,
        status: 'uploaded',
      },
      transaction: options.transaction,
    },
  );
  return updated === 1;
}

/**
 * Reset stale processing batches when worker lease expired (crash recovery).
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function resetStaleProcessingBatches(models, jobId, options = {}) {
  const now = new Date();
  return models.IntegrationSyncJobBatch.update(
    {
      status: 'uploaded',
      started_at: null,
      updated_at: now,
    },
    {
      where: {
        job_id: jobId,
        status: 'processing',
      },
      transaction: options.transaction,
    },
  );
}

/**
 * Next uploaded batch after checkpoint (resume support).
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {string} phase
 * @param {number} afterBatchIndex
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findNextUploadedBatch(models, jobId, phase, afterBatchIndex, options = {}) {
  return models.IntegrationSyncJobBatch.findOne({
    where: {
      job_id: jobId,
      phase,
      status: 'uploaded',
      batch_index: { [Op.gt]: afterBatchIndex },
    },
    order: [['batch_index', 'ASC']],
    transaction: options.transaction,
  });
}

/**
 * Count batches by status for a phase.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {string} phase
 * @param {string[]} statuses
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function countBatchesByStatuses(models, jobId, phase, statuses, options = {}) {
  return models.IntegrationSyncJobBatch.count({
    where: {
      job_id: jobId,
      phase,
      status: { [Op.in]: statuses },
    },
    transaction: options.transaction,
  });
}

/**
 * Total uploaded batch rows for a phase.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {string} phase
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function countUploadedBatches(models, jobId, phase, options = {}) {
  return models.IntegrationSyncJobBatch.count({
    where: { job_id: jobId, phase },
    transaction: options.transaction,
  });
}

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {string} phase
 */
function getExpectedBatchesFromMetadata(metadata, phase) {
  if (!metadata || typeof metadata !== 'object') {
    return 0;
  }

  const phaseProgress = metadata.phaseProgress;
  if (!phaseProgress || typeof phaseProgress !== 'object') {
    return 0;
  }

  const phaseData = phaseProgress[phase];
  if (!phaseData || typeof phaseData !== 'object') {
    return 0;
  }

  return Number(phaseData.expectedBatches) || 0;
}

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {string} phase
 */
function getPhaseCheckpointFromMetadata(metadata, phase) {
  if (!metadata || typeof metadata !== 'object') {
    return -1;
  }

  const phaseProgress = metadata.phaseProgress;
  if (!phaseProgress || typeof phaseProgress !== 'object') {
    return -1;
  }

  const phaseData = phaseProgress[phase];
  if (!phaseData || typeof phaseData !== 'object') {
    return -1;
  }

  const index = phaseData.lastCompletedBatchIndex;
  return Number.isInteger(index) ? index : -1;
}

/**
 * @param {Record<string, unknown> | null | undefined} metadata
 * @param {string} phase
 * @param {number} batchIndex
 * @param {number} [expectedBatches]
 */
function mergePhaseCheckpointMetadata(metadata, phase, batchIndex, expectedBatches) {
  /** @type {Record<string, unknown>} */
  const next = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  /** @type {Record<string, unknown>} */
  const phaseProgress =
    next.phaseProgress && typeof next.phaseProgress === 'object'
      ? { ...next.phaseProgress }
      : {};

  /** @type {Record<string, unknown>} */
  const existing =
    phaseProgress[phase] && typeof phaseProgress[phase] === 'object'
      ? { ...phaseProgress[phase] }
      : {};

  existing.lastCompletedBatchIndex = batchIndex;
  if (expectedBatches !== undefined) {
    existing.expectedBatches = expectedBatches;
  }

  phaseProgress[phase] = existing;
  next.phaseProgress = phaseProgress;
  return next;
}

/**
 * Phase upload tracking for GET /catalog/sync/:jobId.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Model | null} job
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<Record<string, { expected: number, uploaded: number, completed: number }>>}
 */
async function getPhaseUploadProgress(models, job, options = {}) {
  const jobId = job?.id;
  if (!jobId) {
    return {};
  }

  const metadata = job.get ? job.get('metadata') : job.metadata;
  /** @type {Record<string, { expected: number, uploaded: number, completed: number }>} */
  const progress = {};

  for (const phase of SYNC_PHASES) {
    if (phase === 'done') {
      continue;
    }

    const expected = getExpectedBatchesFromMetadata(metadata, phase);
    const uploaded = await countUploadedBatches(models, jobId, phase, options);
    const completed = await countBatchesByStatuses(
      models,
      jobId,
      phase,
      ['completed', 'completed_with_errors'],
      options,
    );

    if (expected > 0 || uploaded > 0) {
      progress[phase] = { expected, uploaded, completed };
    }
  }

  return progress;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {{ limit?: number, transaction?: import('sequelize').Transaction }} [options]
 */
async function listBatchesForJob(models, jobId, options = {}) {
  return models.IntegrationSyncJobBatch.findAll({
    where: { job_id: jobId },
    order: [
      ['phase', 'ASC'],
      ['batch_index', 'ASC'],
    ],
    limit: options.limit,
    transaction: options.transaction,
  });
}

module.exports = {
  createBatch,
  getBatch,
  updateBatch,
  claimBatchForProcessing,
  resetStaleProcessingBatches,
  findNextUploadedBatch,
  countBatchesByStatuses,
  countUploadedBatches,
  getExpectedBatchesFromMetadata,
  getPhaseCheckpointFromMetadata,
  mergePhaseCheckpointMetadata,
  getPhaseUploadProgress,
  listBatchesForJob,
};
