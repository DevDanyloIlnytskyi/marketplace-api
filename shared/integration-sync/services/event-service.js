const { SYNC_EVENT_TYPES } = require('../constants');
const { createEvent } = require('../repositories/event-repository');

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   jobId: string,
 *   tenantId: string,
 *   eventType: string,
 *   phase?: string | null,
 *   batchIndex?: number | null,
 *   detail?: Record<string, unknown> | null,
 *   transaction?: import('sequelize').Transaction,
 * }} params
 */
async function recordEvent(models, params) {
  if (!SYNC_EVENT_TYPES.includes(params.eventType)) {
    throw new Error(`Unknown sync event type: ${params.eventType}`);
  }

  return createEvent(
    models,
    {
      job_id: params.jobId,
      tenant_id: params.tenantId,
      event_type: params.eventType,
      phase: params.phase ?? null,
      batch_index: params.batchIndex ?? null,
      detail: params.detail ?? null,
    },
    { transaction: params.transaction },
  );
}

module.exports = {
  recordEvent,
};
