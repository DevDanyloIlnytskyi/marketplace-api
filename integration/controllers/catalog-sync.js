const {
  createSyncJob,
  getSyncJob,
  mapJobToResponse,
  resumeSyncJob,
  cancelSyncJob,
  getSyncJobEvents,
} = require('../../shared/integration-sync');
const { uploadSyncChunk } = require('../../shared/integration-sync/services/chunk-upload-service');
const { successResponse } = require('../../shared/integration/http');

/**
 * POST /api/integration/v1/catalog/sync
 */
async function createCatalogSyncJob(req, res) {
  const job = await createSyncJob(req.models, {
    tenantId: req.tenant.id,
    apiKeyId: req.integration.keyId,
    idempotencyKey: String(req.get('Idempotency-Key') || '').trim(),
    body: req.body,
  });

  return successResponse(res, req, mapJobToResponse(job), 201);
}

/**
 * GET /api/integration/v1/catalog/sync/:jobId
 */
async function getCatalogSyncJob(req, res) {
  const data = await getSyncJob(req.models, req.tenant.id, req.params.jobId);
  return successResponse(res, req, data);
}

/**
 * POST /api/integration/v1/catalog/sync/:jobId/resume
 */
async function resumeCatalogSyncJob(req, res) {
  const data = await resumeSyncJob(req.models, req.tenant.id, req.params.jobId);
  return successResponse(res, req, data, 202);
}

/**
 * POST /api/integration/v1/catalog/sync/:jobId/cancel
 */
async function cancelCatalogSyncJob(req, res) {
  const data = await cancelSyncJob(req.models, req.tenant.id, req.params.jobId);
  return successResponse(res, req, data, 202);
}

/**
 * GET /api/integration/v1/catalog/sync/:jobId/events
 */
async function listCatalogSyncJobEvents(req, res) {
  const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
  const events = await getSyncJobEvents(req.models, req.tenant.id, req.params.jobId, {
    limit,
  });
  return successResponse(res, req, { events });
}

/**
 * POST /api/integration/v1/catalog/sync/:jobId/chunks
 */
async function uploadCatalogSyncChunk(req, res) {
  const data = await uploadSyncChunk(req.models, {
    tenantId: req.tenant.id,
    jobId: req.params.jobId,
    body: req.body,
  });
  return successResponse(res, req, data, 202);
}

module.exports = {
  createCatalogSyncJob,
  getCatalogSyncJob,
  resumeCatalogSyncJob,
  cancelCatalogSyncJob,
  listCatalogSyncJobEvents,
  uploadCatalogSyncChunk,
};
