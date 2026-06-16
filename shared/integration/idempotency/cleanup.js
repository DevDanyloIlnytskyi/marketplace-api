const { deleteExpired } = require('./repository');

/**
 * Remove expired idempotency records for a tenant (or all rows when tenant omitted).
 * Intended for cron / ops CLI — no scheduler mounted in Platform-5.3.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{ tenantId?: string, before?: Date }} [options]
 * @returns {Promise<number>} deleted row count
 */
async function cleanupExpiredIdempotencyKeys(models, options = {}) {
  return deleteExpired(models, options);
}

module.exports = {
  cleanupExpiredIdempotencyKeys,
};
