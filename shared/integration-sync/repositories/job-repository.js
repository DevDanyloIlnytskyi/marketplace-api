const { Op } = require('sequelize');
const {
  ACTIVE_SYNC_JOB_STATUSES,
  SYNC_LEASE_DURATION_MS,
} = require('../constants');

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {Record<string, unknown>} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createJob(models, data, options = {}) {
  return models.IntegrationSyncJob.create(data, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function getJob(models, jobId, options = {}) {
  return models.IntegrationSyncJob.findByPk(jobId, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {Record<string, unknown>} patch
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function updateJob(models, jobId, patch, options = {}) {
  const now = new Date();
  const [updated] = await models.IntegrationSyncJob.update(
    { ...patch, updated_at: now },
    {
      where: { id: jobId },
      transaction: options.transaction,
    },
  );
  return updated;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findActiveJobForTenant(models, tenantId, options = {}) {
  return models.IntegrationSyncJob.findOne({
    where: {
      tenant_id: tenantId,
      status: { [Op.in]: ACTIVE_SYNC_JOB_STATUSES },
    },
    order: [['created_at', 'DESC']],
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findClaimableJobs(models, tenantId, options = {}) {
  const now = new Date();
  return models.IntegrationSyncJob.findAll({
    where: {
      tenant_id: tenantId,
      [Op.or]: [
        { status: 'pending' },
        {
          status: { [Op.in]: ['running', 'paused'] },
          [Op.or]: [
            { lease_expires_at: null },
            { lease_expires_at: { [Op.lt]: now } },
          ],
        },
      ],
    },
    order: [['created_at', 'ASC']],
    transaction: options.transaction,
  });
}

/**
 * Atomically acquire or renew lease when free/expired/same worker.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {string} workerId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<boolean>}
 */
async function acquireLease(models, jobId, workerId, options = {}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + SYNC_LEASE_DURATION_MS);

  const [updated] = await models.IntegrationSyncJob.update(
    {
      worker_id: workerId,
      heartbeat_at: now,
      lease_expires_at: leaseExpiresAt,
      updated_at: now,
    },
    {
      where: {
        id: jobId,
        [Op.or]: [
          { lease_expires_at: null },
          { lease_expires_at: { [Op.lt]: now } },
          { worker_id: workerId },
        ],
      },
      transaction: options.transaction,
    },
  );

  return updated === 1;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {string} workerId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<boolean>}
 */
async function renewHeartbeat(models, jobId, workerId, options = {}) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + SYNC_LEASE_DURATION_MS);

  const [updated] = await models.IntegrationSyncJob.update(
    {
      heartbeat_at: now,
      lease_expires_at: leaseExpiresAt,
      updated_at: now,
    },
    {
      where: {
        id: jobId,
        worker_id: workerId,
      },
      transaction: options.transaction,
    },
  );

  return updated === 1;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {Record<string, unknown>} [patch]
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function completeJob(models, jobId, patch = {}, options = {}) {
  const now = new Date();
  return updateJob(
    models,
    jobId,
    {
      status: 'completed',
      finished_at: now,
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
      ...patch,
    },
    options,
  );
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {Record<string, unknown>} [patch]
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function failJob(models, jobId, patch = {}, options = {}) {
  const now = new Date();
  return updateJob(
    models,
    jobId,
    {
      status: 'failed',
      finished_at: now,
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
      ...patch,
    },
    options,
  );
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {Record<string, unknown>} [patch]
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function cancelJob(models, jobId, patch = {}, options = {}) {
  const now = new Date();
  return updateJob(
    models,
    jobId,
    {
      status: 'cancelled',
      finished_at: now,
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
      ...patch,
    },
    options,
  );
}

module.exports = {
  createJob,
  getJob,
  updateJob,
  findActiveJobForTenant,
  findClaimableJobs,
  acquireLease,
  renewHeartbeat,
  completeJob,
  failJob,
  cancelJob,
};
