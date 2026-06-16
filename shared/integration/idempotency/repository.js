const { Op } = require('sequelize');

const { IDEMPOTENCY_STATUS } = require('./constants');

/**
 * @param {import('sequelize').ModelStatic} Model
 */
function getModel(models) {
  return models.IntegrationIdempotencyKey;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   tenantId: string,
 *   apiKeyId: string,
 *   idempotencyKey: string,
 *   requestHash: string,
 *   httpMethod: string,
 *   routePath: string,
 *   requestId: string,
 *   expiresAt: Date,
 * }} entry
 */
async function createPending(models, entry) {
  const Model = getModel(models);
  return Model.create({
    tenant_id: entry.tenantId,
    api_key_id: entry.apiKeyId,
    idempotency_key: entry.idempotencyKey,
    request_hash: entry.requestHash,
    http_method: entry.httpMethod,
    route_path: entry.routePath,
    status: IDEMPOTENCY_STATUS.PENDING,
    status_code: null,
    response_body: null,
    request_id: entry.requestId,
    created_at: new Date(),
    expires_at: entry.expiresAt,
    completed_at: null,
  });
}

/**
 * Active = not expired.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{ tenantId: string, apiKeyId: string, idempotencyKey: string }} query
 */
async function findActive(models, query) {
  const Model = getModel(models);
  return Model.findOne({
    where: {
      tenant_id: query.tenantId,
      api_key_id: query.apiKeyId,
      idempotency_key: query.idempotencyKey,
      expires_at: { [Op.gt]: new Date() },
    },
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number | string} id
 * @param {{ statusCode: number, responseBody: unknown }} result
 */
async function completeRecord(models, id, result) {
  const Model = getModel(models);
  await Model.update(
    {
      status: IDEMPOTENCY_STATUS.COMPLETED,
      status_code: result.statusCode,
      response_body: result.responseBody,
      completed_at: new Date(),
    },
    { where: { id } },
  );
}

/**
 * Remove pending slot so client may retry after a failed write.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number | string} id
 */
async function deleteRecord(models, id) {
  const Model = getModel(models);
  await Model.destroy({ where: { id } });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{ tenantId?: string, before?: Date }} [options]
 * @returns {Promise<number>}
 */
async function deleteExpired(models, options = {}) {
  const Model = getModel(models);
  const before = options.before || new Date();

  /** @type {import('sequelize').WhereOptions} */
  const where = {
    expires_at: { [Op.lte]: before },
  };

  if (options.tenantId) {
    where.tenant_id = options.tenantId;
  }

  return Model.destroy({ where });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number | string} id
 */
async function findById(models, id) {
  const Model = getModel(models);
  return Model.findByPk(id);
}

module.exports = {
  createPending,
  findActive,
  completeRecord,
  deleteRecord,
  deleteExpired,
  findById,
};
