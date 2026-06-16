const { UniqueConstraintError } = require('sequelize');
const {
  SYNC_PRODUCT_CHUNK_MAX,
  SYNC_PRICE_CHUNK_MAX,
  SYNC_STOCK_CHUNK_MAX,
  SYNC_MEDIA_CHUNK_MAX,
  SUPPORTED_CHUNK_PHASES,
  SYNC_PHASE_ORDER,
} = require('../constants');
const {
  ACTIVE_SYNC_JOB_STATUSES,
} = require('../constants');
const {
  createSyncError,
  syncNotFoundError,
  SYNC_ERROR_CODE,
} = require('../errors');
const { createIntegrationError } = require('../../integration/http/errors');
const { INTEGRATION_ERROR_CODE } = require('../../integration/http/constants');
const { getJob, updateJob } = require('../repositories/job-repository');
const {
  createBatch,
  getBatch,
  getExpectedBatchesFromMetadata,
} = require('../repositories/batch-repository');
const { recordEvent } = require('./event-service');

const PRODUCT_PHASE = 'products';
const PRICE_PHASE = 'prices';
const STOCK_PHASE = 'stock';
const MEDIA_PHASE = 'media';

const PHASE_CHUNK_MAX = Object.freeze({
  products: SYNC_PRODUCT_CHUNK_MAX,
  prices: SYNC_PRICE_CHUNK_MAX,
  stock: SYNC_STOCK_CHUNK_MAX,
  media: SYNC_MEDIA_CHUNK_MAX,
});

const PHASE_JOB_TYPES = Object.freeze({
  products: new Set(['products', 'full_catalog']),
  prices: new Set(['prices', 'full_catalog']),
  stock: new Set(['stock', 'full_catalog']),
  media: new Set(['media', 'full_catalog']),
});

/**
 * @param {unknown} value
 * @param {string} field
 */
function requireField(value, field) {
  if (value === undefined || value === null || value === '') {
    throw createIntegrationError(INTEGRATION_ERROR_CODE.VALIDATION_ERROR, {
      message: `${field} is required.`,
      details: { field },
      status: 400,
    });
  }
}

/**
 * @param {Record<string, unknown>} body
 */
function validateChunkBody(body) {
  requireField(body?.phase, 'phase');
  requireField(body?.batchIndex, 'batchIndex');
  requireField(body?.expectedBatches, 'expectedBatches');
  requireField(body?.records, 'records');

  const phase = String(body.phase).trim();
  if (!SUPPORTED_CHUNK_PHASES.includes(phase)) {
    throw createIntegrationError(SYNC_ERROR_CODE.UNSUPPORTED_PHASE, {
      status: 400,
      details: { phase, supported: SUPPORTED_CHUNK_PHASES },
    });
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    throw createIntegrationError(INTEGRATION_ERROR_CODE.VALIDATION_ERROR, {
      message: 'records must be a non-empty array.',
      status: 400,
    });
  }

  const maxRecords = PHASE_CHUNK_MAX[phase];
  if (body.records.length > maxRecords) {
    throw createIntegrationError(SYNC_ERROR_CODE.CHUNK_SIZE_LIMIT_EXCEEDED, {
      status: 400,
      details: { phase, maxRecords, received: body.records.length },
    });
  }

  const batchIndex = Number(body.batchIndex);
  const expectedBatches = Number(body.expectedBatches);

  if (!Number.isInteger(batchIndex) || batchIndex < 0) {
    throw createIntegrationError(INTEGRATION_ERROR_CODE.VALIDATION_ERROR, {
      message: 'batchIndex must be a non-negative integer.',
      status: 400,
    });
  }

  if (!Number.isInteger(expectedBatches) || expectedBatches < 1) {
    throw createIntegrationError(INTEGRATION_ERROR_CODE.VALIDATION_ERROR, {
      message: 'expectedBatches must be a positive integer.',
      status: 400,
    });
  }

  return {
    phase,
    batchIndex,
    expectedBatches,
    records: body.records,
  };
}

/**
 * @param {Record<string, unknown> | null} metadata
 * @param {string} phase
 * @param {number} expectedBatches
 */
function mergePhaseProgressMetadata(metadata, phase, expectedBatches) {
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

  existing.expectedBatches = expectedBatches;
  if (existing.lastCompletedBatchIndex === undefined) {
    existing.lastCompletedBatchIndex = -1;
  }

  phaseProgress[phase] = existing;
  next.phaseProgress = phaseProgress;
  return next;
}

/**
 * @param {string} jobType
 * @param {string} phase
 */
function assertJobSupportsPhase(jobType, phase) {
  const allowed = PHASE_JOB_TYPES[phase];
  if (!allowed || !allowed.has(jobType)) {
    throw createIntegrationError(INTEGRATION_ERROR_CODE.VALIDATION_ERROR, {
      message: `Job type does not support ${phase} phase.`,
      details: { jobType, phase },
      status: 400,
    });
  }
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   tenantId: string,
 *   jobId: string,
 *   body: Record<string, unknown>,
 * }} params
 */
async function uploadSyncChunk(models, params) {
  const job = await getJob(models, params.jobId);
  if (!job || job.tenant_id !== params.tenantId) {
    throw syncNotFoundError();
  }

  if (!ACTIVE_SYNC_JOB_STATUSES.includes(job.status)) {
    throw createSyncError(SYNC_ERROR_CODE.INVALID_STATE_TRANSITION, {
      details: { status: job.status, action: 'upload_chunk' },
    });
  }

  const validated = validateChunkBody(params.body);
  assertJobSupportsPhase(job.job_type, validated.phase);

  const existing = await getBatch(
    models,
    params.jobId,
    validated.phase,
    validated.batchIndex,
  );
  if (existing) {
    throw createSyncError(SYNC_ERROR_CODE.DUPLICATE_BATCH, {
      details: {
        phase: validated.phase,
        batchIndex: validated.batchIndex,
      },
    });
  }

  const now = new Date();
  const maxRecords = PHASE_CHUNK_MAX[validated.phase];

  try {
    const batch = await createBatch(models, {
      job_id: params.jobId,
      phase: validated.phase,
      batch_index: validated.batchIndex,
      status: 'uploaded',
      item_count: validated.records.length,
      processed_count: 0,
      failed_count: 0,
      errors: null,
      records: validated.records,
      created_at: now,
      updated_at: now,
    });

    const metadata = mergePhaseProgressMetadata(
      job.metadata,
      validated.phase,
      validated.expectedBatches,
    );

    await updateJob(models, params.jobId, {
      current_phase: validated.phase,
      batch_size: maxRecords,
      total_records: (job.total_records || 0) + validated.records.length,
      metadata,
    });

    await recordEvent(models, {
      jobId: params.jobId,
      tenantId: params.tenantId,
      eventType: 'batch.uploaded',
      phase: validated.phase,
      batchIndex: validated.batchIndex,
      detail: {
        itemCount: validated.records.length,
        expectedBatches: validated.expectedBatches,
      },
    });

    const plain = batch.get({ plain: true });
    return {
      jobId: params.jobId,
      batchId: plain.id,
      phase: validated.phase,
      batchIndex: validated.batchIndex,
      status: 'uploaded',
      itemCount: validated.records.length,
      expectedBatches: validated.expectedBatches,
    };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw createSyncError(SYNC_ERROR_CODE.DUPLICATE_BATCH, {
        details: {
          phase: validated.phase,
          batchIndex: validated.batchIndex,
        },
      });
    }
    throw error;
  }
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Model} job
 * @param {string} phase
 */
async function isPhaseComplete(models, job, phase) {
  const expected = getExpectedBatchesFromMetadata(job.metadata, phase);
  const { countBatchesByStatuses, countUploadedBatches } = require('../repositories/batch-repository');
  const uploaded = await countUploadedBatches(models, job.id, phase);
  const completed = await countBatchesByStatuses(models, job.id, phase, [
    'completed',
    'completed_with_errors',
  ]);

  if (expected <= 0) {
    if (uploaded <= 0) {
      return false;
    }

    const pending = await countBatchesByStatuses(models, job.id, phase, [
      'uploaded',
      'processing',
    ]);
    return pending === 0 && completed >= uploaded;
  }

  return uploaded >= expected && completed >= expected;
}

/**
 * @param {import('sequelize').Model} job
 */
function getActivePhasesFromJob(job) {
  const metadata = job.metadata;
  if (!metadata || typeof metadata !== 'object' || !metadata.phaseProgress) {
    return [];
  }

  return Object.keys(metadata.phaseProgress).filter((phase) =>
    SUPPORTED_CHUNK_PHASES.includes(phase),
  );
}

/**
 * Phases declared on the job (create body) or inferred from uploads.
 *
 * @param {import('sequelize').Model} job
 */
function getExpectedPhasesFromJob(job) {
  const metadata = job.metadata;
  if (metadata && Array.isArray(metadata.phases) && metadata.phases.length > 0) {
    return SYNC_PHASE_ORDER.filter(
      (phase) => metadata.phases.includes(phase) && SUPPORTED_CHUNK_PHASES.includes(phase),
    );
  }

  return getActivePhasesFromJob(job);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Model} job
 */
async function isJobComplete(models, job) {
  const phases = getExpectedPhasesFromJob(job);
  if (phases.length === 0) {
    return false;
  }

  for (const phase of phases) {
    if (!(await isPhaseComplete(models, job, phase))) {
      return false;
    }
  }

  return true;
}

/** @deprecated Use uploadSyncChunk */
const uploadProductChunk = uploadSyncChunk;

module.exports = {
  validateChunkBody,
  uploadSyncChunk,
  uploadProductChunk,
  isPhaseComplete,
  isJobComplete,
  getActivePhasesFromJob,
  getExpectedPhasesFromJob,
  mergePhaseProgressMetadata,
  PRODUCT_PHASE,
  PRICE_PHASE,
  STOCK_PHASE,
  MEDIA_PHASE,
  PHASE_CHUNK_MAX,
};
