const { Op } = require('sequelize');

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 */
function getModel(models) {
  if (!models || !models.IntegrationLog) {
    throw new Error('IntegrationLog model is not registered on tenant models');
  }
  return models.IntegrationLog;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   tenantId: string,
 *   apiKeyId?: string | null,
 *   requestId: string,
 *   method: string,
 *   path: string,
 *   statusCode: number,
 *   success: boolean,
 *   clientIp?: string | null,
 *   userAgent?: string | null,
 *   durationMs: number,
 *   requestSize?: number | null,
 *   responseSize?: number | null,
 *   errorCode?: string | null,
 * }} entry
 */
async function createLog(models, entry) {
  const IntegrationLog = getModel(models);
  return IntegrationLog.create({
    tenant_id: entry.tenantId,
    api_key_id: entry.apiKeyId ?? null,
    request_id: entry.requestId,
    method: entry.method,
    path: entry.path,
    status_code: entry.statusCode,
    success: entry.success,
    client_ip: entry.clientIp ?? null,
    user_agent: entry.userAgent ?? null,
    duration_ms: entry.durationMs,
    request_size: entry.requestSize ?? null,
    response_size: entry.responseSize ?? null,
    error_code: entry.errorCode ?? null,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} apiKeyId
 * @param {{ limit?: number }} [options]
 */
async function findByKey(models, apiKeyId, options = {}) {
  const limit = options.limit ?? 50;
  const IntegrationLog = getModel(models);
  return IntegrationLog.findAll({
    where: { api_key_id: apiKeyId },
    order: [['created_at', 'DESC']],
    limit,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {{ limit?: number }} [options]
 */
async function findByTenant(models, tenantId, options = {}) {
  const limit = options.limit ?? 50;
  const IntegrationLog = getModel(models);
  return IntegrationLog.findAll({
    where: { tenant_id: String(tenantId).trim().toLowerCase() },
    order: [['created_at', 'DESC']],
    limit,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{ tenantId?: string, limit?: number, since?: Date }} [options]
 */
async function findRecent(models, options = {}) {
  const limit = options.limit ?? 50;
  const IntegrationLog = getModel(models);
  const where = {};

  if (options.tenantId) {
    where.tenant_id = String(options.tenantId).trim().toLowerCase();
  }
  if (options.since) {
    where.created_at = { [Op.gte]: options.since };
  }

  return IntegrationLog.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
  });
}

module.exports = {
  createLog,
  findByKey,
  findByTenant,
  findRecent,
};
