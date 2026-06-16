const crypto = require('crypto');
const {
  SYNC_JOB_TYPES,
  SYNC_MODES,
  SYNC_JOB_RETENTION_MS,
} = require('../constants');
const { assertTransition } = require('../state-machine');
const {
  createSyncError,
  syncNotFoundError,
  SYNC_ERROR_CODE,
} = require('../errors');
const { createIntegrationError } = require('../../integration/http/errors');
const { INTEGRATION_ERROR_CODE } = require('../../integration/http/constants');
const {
  createJob,
  getJob,
  updateJob,
  findActiveJobForTenant,
} = require('../repositories/job-repository');
const { getPhaseUploadProgress } = require('../repositories/batch-repository');
const { listEventsForJob } = require('../repositories/event-repository');
const { recordEvent } = require('./event-service');

/**
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string} field
 */
function assertEnum(value, allowed, field) {
  const normalized = String(value || '').trim();
  if (!allowed.includes(normalized)) {
    throw createIntegrationError(INTEGRATION_ERROR_CODE.VALIDATION_ERROR, {
      message: `Invalid ${field}.`,
      details: { field, allowed },
      status: 400,
    });
  }
  return normalized;
}

/**
 * @param {Record<string, unknown>} body
 */
function validateCreateBody(body) {
  const jobType = assertEnum(body?.jobType, SYNC_JOB_TYPES, 'jobType');
  const syncMode = assertEnum(body?.syncMode, SYNC_MODES, 'syncMode');

  /** @type {Record<string, unknown>} */
  const metadata = body?.metadata && typeof body.metadata === 'object'
    ? { ...body.metadata }
    : {};

  if (body?.expectedCounts && typeof body.expectedCounts === 'object') {
    metadata.expectedCounts = body.expectedCounts;
  }

  if (Array.isArray(body?.phases)) {
    metadata.phases = body.phases;
  }

  let totalRecords = 0;
  if (body?.expectedCounts && typeof body.expectedCounts === 'object') {
    for (const value of Object.values(body.expectedCounts)) {
      totalRecords += Number(value) || 0;
    }
  }

  return {
    jobType,
    syncMode,
    clientReference:
      body?.clientReference !== undefined && body?.clientReference !== null
        ? String(body.clientReference).trim().slice(0, 128)
        : null,
    sourceType:
      body?.sourceType !== undefined && body?.sourceType !== null
        ? String(body.sourceType).trim().slice(0, 32)
        : null,
    sourceUri:
      body?.sourceUri !== undefined && body?.sourceUri !== null
        ? String(body.sourceUri).trim().slice(0, 512)
        : null,
    metadata,
    totalRecords,
  };
}

/**
 * @param {import('sequelize').Model} job
 */
function mapJobToResponse(job) {
  const plain = job.get({ plain: true });
  const progressPercent =
    plain.total_records > 0
      ? Math.round((plain.processed_records / plain.total_records) * 1000) / 10
      : plain.status === 'completed'
        ? 100
        : 0;

  return {
    jobId: plain.id,
    status: plain.status,
    jobType: plain.job_type,
    syncMode: plain.sync_mode,
    currentPhase: plain.current_phase,
    totalRecords: plain.total_records,
    processedRecords: plain.processed_records,
    createdCount: plain.created_count,
    updatedCount: plain.updated_count,
    failedCount: plain.failed_count,
    skippedCount: plain.skipped_count,
    batchSize: plain.batch_size,
    lastCompletedBatchIndex: plain.last_completed_batch_index,
    lastCompletedPhase: plain.last_completed_phase,
    clientReference: plain.client_reference,
    workerId: plain.worker_id,
    heartbeatAt: plain.heartbeat_at,
    leaseExpiresAt: plain.lease_expires_at,
    sourceType: plain.source_type,
    sourceUri: plain.source_uri,
    errorSummary: plain.error_summary,
    metadata: plain.metadata,
    progressPercent,
    startedAt: plain.started_at,
    finishedAt: plain.finished_at,
    expiresAt: plain.expires_at,
    createdAt: plain.created_at,
    updatedAt: plain.updated_at,
  };
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   tenantId: string,
 *   apiKeyId: string,
 *   idempotencyKey: string,
 *   body: Record<string, unknown>,
 * }} params
 */
async function createSyncJob(models, params) {
  const active = await findActiveJobForTenant(models, params.tenantId);
  if (active) {
    throw createSyncError(SYNC_ERROR_CODE.SYNC_ALREADY_RUNNING, {
      details: {
        activeJobId: active.id,
        activeStatus: active.status,
      },
    });
  }

  const validated = validateCreateBody(params.body);
  const now = new Date();
  const jobId = crypto.randomUUID();

  const job = await createJob(models, {
    id: jobId,
    tenant_id: params.tenantId,
    api_key_id: params.apiKeyId,
    idempotency_key: params.idempotencyKey,
    job_type: validated.jobType,
    sync_mode: validated.syncMode,
    status: 'pending',
    current_phase: null,
    total_records: validated.totalRecords,
    processed_records: 0,
    created_count: 0,
    updated_count: 0,
    failed_count: 0,
    skipped_count: 0,
    batch_size: 0,
    last_completed_batch_index: -1,
    last_completed_phase: null,
    client_reference: validated.clientReference,
    worker_id: null,
    heartbeat_at: null,
    lease_expires_at: null,
    source_type: validated.sourceType,
    source_uri: validated.sourceUri,
    error_summary: null,
    metadata: validated.metadata,
    started_at: null,
    finished_at: null,
    expires_at: new Date(now.getTime() + SYNC_JOB_RETENTION_MS),
    created_at: now,
    updated_at: now,
  });

  await recordEvent(models, {
    jobId,
    tenantId: params.tenantId,
    eventType: 'job.created',
    detail: {
      jobType: validated.jobType,
      syncMode: validated.syncMode,
      clientReference: validated.clientReference,
    },
  });

  return job;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {string} jobId
 */
async function getSyncJob(models, tenantId, jobId) {
  const job = await getJob(models, jobId);
  if (!job || job.tenant_id !== tenantId) {
    throw syncNotFoundError();
  }

  const phaseUploadProgress = await getPhaseUploadProgress(models, job);
  const response = mapJobToResponse(job);
  response.phaseUploadProgress = phaseUploadProgress;
  return response;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {string} jobId
 * @param {string} targetStatus
 * @param {Record<string, unknown>} [patch]
 */
async function transitionJob(models, tenantId, jobId, targetStatus, patch = {}) {
  const job = await getJob(models, jobId);
  if (!job || job.tenant_id !== tenantId) {
    throw syncNotFoundError();
  }

  assertTransition(job.status, targetStatus);

  const now = new Date();
  /** @type {Record<string, unknown>} */
  const updatePatch = {
    status: targetStatus,
    updated_at: now,
    ...patch,
  };

  if (targetStatus === 'running' && !job.started_at) {
    updatePatch.started_at = now;
  }

  if (['completed', 'failed', 'cancelled'].includes(targetStatus)) {
    updatePatch.finished_at = now;
    updatePatch.worker_id = null;
    updatePatch.heartbeat_at = null;
    updatePatch.lease_expires_at = null;
  }

  await updateJob(models, jobId, updatePatch);
  return getJob(models, jobId);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {string} jobId
 */
async function resumeSyncJob(models, tenantId, jobId) {
  const job = await transitionJob(models, tenantId, jobId, 'running');

  await recordEvent(models, {
    jobId,
    tenantId,
    eventType: 'job.resumed',
    detail: { previousStatus: 'paused' },
  });

  return mapJobToResponse(job);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {string} jobId
 */
async function cancelSyncJob(models, tenantId, jobId) {
  const existing = await getJob(models, jobId);
  if (!existing || existing.tenant_id !== tenantId) {
    throw syncNotFoundError();
  }

  const job = await transitionJob(models, tenantId, jobId, 'cancelled');

  await recordEvent(models, {
    jobId,
    tenantId,
    eventType: 'job.cancelled',
  });

  return mapJobToResponse(job);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {string} jobId
 * @param {{ limit?: number }} [options]
 */
async function getSyncJobEvents(models, tenantId, jobId, options = {}) {
  const job = await getJob(models, jobId);
  if (!job || job.tenant_id !== tenantId) {
    throw syncNotFoundError();
  }

  const events = await listEventsForJob(models, jobId, { limit: options.limit });
  return events.map((event) => {
    const plain = event.get({ plain: true });
    return {
      id: plain.id,
      eventType: plain.event_type,
      phase: plain.phase,
      batchIndex: plain.batch_index,
      detail: plain.detail,
      createdAt: plain.created_at,
    };
  });
}

module.exports = {
  validateCreateBody,
  mapJobToResponse,
  createSyncJob,
  getSyncJob,
  transitionJob,
  resumeSyncJob,
  cancelSyncJob,
  getSyncJobEvents,
};
