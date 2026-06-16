const { createIntegrationError } = require('../integration/http/errors');
const { INTEGRATION_ERROR_CODE } = require('../integration/http/constants');

const SYNC_ERROR_CODE = Object.freeze({
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  SYNC_ALREADY_RUNNING: 'SYNC_ALREADY_RUNNING',
  LEASE_NOT_ACQUIRED: 'LEASE_NOT_ACQUIRED',
  DUPLICATE_BATCH: 'DUPLICATE_BATCH',
  CHUNK_SIZE_LIMIT_EXCEEDED: 'CHUNK_SIZE_LIMIT_EXCEEDED',
  UNSUPPORTED_PHASE: 'UNSUPPORTED_PHASE',
});

const SYNC_ERROR_MESSAGE = Object.freeze({
  [SYNC_ERROR_CODE.INVALID_STATE_TRANSITION]:
    'Sync job state transition is not allowed.',
  [SYNC_ERROR_CODE.SYNC_ALREADY_RUNNING]:
    'An active sync job already exists for this tenant.',
  [SYNC_ERROR_CODE.LEASE_NOT_ACQUIRED]:
    'Could not acquire lease for sync job.',
  [SYNC_ERROR_CODE.DUPLICATE_BATCH]:
    'Batch with this phase and batchIndex already exists for the job.',
  [SYNC_ERROR_CODE.CHUNK_SIZE_LIMIT_EXCEEDED]:
    'Chunk exceeds maximum records per upload.',
  [SYNC_ERROR_CODE.UNSUPPORTED_PHASE]:
    'Sync phase is not supported.',
});

/**
 * @param {string} code
 * @param {{ message?: string, status?: number, details?: unknown }} [options]
 */
function createSyncError(code, options = {}) {
  return createIntegrationError(code, {
    message: options.message || SYNC_ERROR_MESSAGE[code] || code,
    status: options.status ?? 409,
    details: options.details,
  });
}

function syncNotFoundError() {
  return createIntegrationError(INTEGRATION_ERROR_CODE.NOT_FOUND, {
    message: 'Sync job not found.',
    status: 404,
  });
}

module.exports = {
  SYNC_ERROR_CODE,
  SYNC_ERROR_MESSAGE,
  createSyncError,
  syncNotFoundError,
};
