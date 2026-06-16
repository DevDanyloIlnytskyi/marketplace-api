/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {Record<string, unknown>} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createEvent(models, data, options = {}) {
  return models.IntegrationSyncJobEvent.create(data, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {{ limit?: number, transaction?: import('sequelize').Transaction }} [options]
 */
async function listEventsForJob(models, jobId, options = {}) {
  const limit = options.limit ?? 50;
  return models.IntegrationSyncJobEvent.findAll({
    where: { job_id: jobId },
    order: [['created_at', 'DESC']],
    limit,
    transaction: options.transaction,
  });
}

module.exports = {
  createEvent,
  listEventsForJob,
};
