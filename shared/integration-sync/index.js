const {
  SYNC_JOB_STATUSES,
  SYNC_JOB_TYPES,
  SYNC_MODES,
  SYNC_PHASES,
  BATCH_STATUSES,
  SYNC_EVENT_TYPES,
  ACTIVE_SYNC_JOB_STATUSES,
  SYNC_LEASE_DURATION_MS,
  SYNC_JOB_RETENTION_MS,
  SYNC_NOOP_WORKER_DELAY_MS,
  SYNC_WORKER_POLL_INTERVAL_MS,
  SYNC_PRODUCT_CHUNK_MAX,
  SYNC_PRICE_CHUNK_MAX,
  SYNC_STOCK_CHUNK_MAX,
  SYNC_MEDIA_CHUNK_MAX,
  SUPPORTED_CHUNK_PHASES,
  SYNC_PHASE_ORDER,
  defineIntegrationSyncJobModel,
  defineIntegrationSyncJobBatchModel,
  defineIntegrationSyncJobEventModel,
} = require('./constants');
const { ALLOWED_TRANSITIONS, canTransition, assertTransition } = require('./state-machine');
const { SYNC_ERROR_CODE, SYNC_ERROR_MESSAGE, createSyncError, syncNotFoundError } = require('./errors');
const jobRepository = require('./repositories/job-repository');
const batchRepository = require('./repositories/batch-repository');
const eventRepository = require('./repositories/event-repository');
const { recordEvent } = require('./services/event-service');
const syncJobService = require('./services/sync-job-service');
const {
  uploadSyncChunk,
  uploadProductChunk,
  isPhaseComplete,
  isJobComplete,
  getActivePhasesFromJob,
  getExpectedPhasesFromJob,
} = require('./services/chunk-upload-service');
const {
  processUploadedBatches,
  processUploadedProductBatches,
} = require('./services/phase-batch-sync-service');
const syncWorker = require('./worker/sync-worker');

module.exports = {
  SYNC_JOB_STATUSES,
  SYNC_JOB_TYPES,
  SYNC_MODES,
  SYNC_PHASES,
  BATCH_STATUSES,
  SYNC_EVENT_TYPES,
  ACTIVE_SYNC_JOB_STATUSES,
  SYNC_LEASE_DURATION_MS,
  SYNC_JOB_RETENTION_MS,
  SYNC_NOOP_WORKER_DELAY_MS,
  SYNC_WORKER_POLL_INTERVAL_MS,
  SYNC_PRODUCT_CHUNK_MAX,
  SYNC_PRICE_CHUNK_MAX,
  SYNC_STOCK_CHUNK_MAX,
  SYNC_MEDIA_CHUNK_MAX,
  SUPPORTED_CHUNK_PHASES,
  SYNC_PHASE_ORDER,
  defineIntegrationSyncJobModel,
  defineIntegrationSyncJobBatchModel,
  defineIntegrationSyncJobEventModel,
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
  SYNC_ERROR_CODE,
  SYNC_ERROR_MESSAGE,
  createSyncError,
  syncNotFoundError,
  ...jobRepository,
  ...batchRepository,
  ...eventRepository,
  recordEvent,
  uploadSyncChunk,
  uploadProductChunk,
  isPhaseComplete,
  isJobComplete,
  getActivePhasesFromJob,
  getExpectedPhasesFromJob,
  processUploadedBatches,
  processUploadedProductBatches,
  ...syncJobService,
  ...syncWorker,
};
