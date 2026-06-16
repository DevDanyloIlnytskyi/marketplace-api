const crypto = require('crypto');
const { Op } = require('sequelize');

const { INTEGRATION_KEY_STATUS, AUTHENTICATABLE_STATUSES } = require('./constants');
const { generateIntegrationApiKey } = require('./generate-key');
const { hashIntegrationApiKey } = require('./hash-key');

const DEFAULT_MARK_USED_THROTTLE_MS = 60_000;

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @returns {import('sequelize').ModelStatic}
 */
function getModel(models) {
  if (!models || !models.IntegrationApiKey) {
    throw new Error('IntegrationApiKey model is not registered on tenant models');
  }
  return models.IntegrationApiKey;
}

/**
 * @param {unknown} scopes
 */
function assertScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('scopes must be a non-empty array of strings');
  }
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !scope.trim()) {
      throw new Error('each scope must be a non-empty string');
    }
  }
}

/**
 * Create a new integration API key. Plaintext is returned once — never stored.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   tenantId: string,
 *   label: string,
 *   scopes: string[],
 *   createdBy?: string,
 *   expiresAt?: Date | null,
 *   rateLimitRpm?: number | null,
 *   status?: string,
 *   rotatedFromId?: string | null,
 * }} options
 * @returns {Promise<{ plaintext: string, record: import('sequelize').Model }>}
 */
async function createKey(models, options) {
  const {
    tenantId,
    label,
    scopes,
    createdBy = null,
    expiresAt = null,
    rateLimitRpm = null,
    status = INTEGRATION_KEY_STATUS.ACTIVE,
    rotatedFromId = null,
  } = options;

  if (!tenantId || !label) {
    throw new Error('tenantId and label are required');
  }
  assertScopes(scopes);

  const IntegrationApiKey = getModel(models);
  const { apiKey, keyPrefix } = generateIntegrationApiKey(tenantId);

  const record = await IntegrationApiKey.create({
    id: crypto.randomUUID(),
    tenant_id: String(tenantId).trim().toLowerCase(),
    label: String(label).trim(),
    key_prefix: keyPrefix,
    key_hash: hashIntegrationApiKey(apiKey),
    scopes,
    status,
    expires_at: expiresAt,
    created_by: createdBy,
    rotated_from_id: rotatedFromId,
    rate_limit_rpm: rateLimitRpm,
  });

  return { plaintext: apiKey, record };
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} keyHash
 */
async function findByHash(models, keyHash) {
  const IntegrationApiKey = getModel(models);
  return IntegrationApiKey.findOne({
    where: { key_hash: keyHash },
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} id
 */
async function findById(models, id) {
  const IntegrationApiKey = getModel(models);
  return IntegrationApiKey.findByPk(id);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} tenantId
 */
async function listActiveKeys(models, tenantId) {
  const IntegrationApiKey = getModel(models);
  return IntegrationApiKey.findAll({
    where: {
      tenant_id: String(tenantId).trim().toLowerCase(),
      status: { [Op.in]: [...AUTHENTICATABLE_STATUSES] },
    },
    order: [['created_at', 'DESC']],
  });
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} id
 * @param {string} [reason]
 */
async function revokeKey(models, id, reason = null) {
  const record = await findById(models, id);
  if (!record) {
    return null;
  }

  await record.update({
    status: INTEGRATION_KEY_STATUS.REVOKED,
    revoked_at: new Date(),
    revoke_reason: reason,
  });

  return record;
}

/**
 * Update last_used_at with optional throttle to reduce write churn.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} id
 * @param {{ throttleMs?: number, force?: boolean }} [options]
 */
async function markUsed(models, id, options = {}) {
  const { throttleMs = DEFAULT_MARK_USED_THROTTLE_MS, force = false } = options;
  const record = await findById(models, id);
  if (!record) {
    return null;
  }

  if (!force && record.last_used_at) {
    const lastUsed = new Date(record.last_used_at).getTime();
    if (Date.now() - lastUsed < throttleMs) {
      return record;
    }
  }

  await record.update({ last_used_at: new Date() });
  return record;
}

/**
 * Start key rotation: old and new keys enter `rotating` status; both remain authenticatable.
 * Completing rotation (revoke old, activate new) is a separate ops step in Platform-4.5.2+.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} keyId
 * @param {{ label?: string, createdBy?: string }} [options]
 */
async function rotateKey(models, keyId, options = {}) {
  const oldKey = await findById(models, keyId);
  if (!oldKey) {
    throw new Error(`Integration API key not found: ${keyId}`);
  }
  if (oldKey.status === INTEGRATION_KEY_STATUS.REVOKED) {
    throw new Error('Cannot rotate a revoked key');
  }

  const { plaintext, record: newKey } = await createKey(models, {
    tenantId: oldKey.tenant_id,
    label: options.label || oldKey.label,
    scopes: oldKey.scopes,
    createdBy: options.createdBy || null,
    expiresAt: oldKey.expires_at,
    rateLimitRpm: oldKey.rate_limit_rpm,
    status: INTEGRATION_KEY_STATUS.ROTATING,
    rotatedFromId: oldKey.id,
  });

  await oldKey.update({
    status: INTEGRATION_KEY_STATUS.ROTATING,
    rotated_to_id: newKey.id,
  });

  return {
    oldKey,
    newKey,
    plaintext,
  };
}

/**
 * Complete rotation: revoke old key, activate new key.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} oldKeyId
 * @param {string} newKeyId
 * @param {string} [reason]
 */
async function completeRotation(models, oldKeyId, newKeyId, reason = 'rotation_completed') {
  const oldKey = await findById(models, oldKeyId);
  const newKey = await findById(models, newKeyId);

  if (!oldKey || !newKey) {
    throw new Error('Both old and new keys must exist to complete rotation');
  }

  await oldKey.update({
    status: INTEGRATION_KEY_STATUS.REVOKED,
    revoked_at: new Date(),
    revoke_reason: reason,
  });

  await newKey.update({
    status: INTEGRATION_KEY_STATUS.ACTIVE,
  });

  return { oldKey, newKey };
}

module.exports = {
  createKey,
  findByHash,
  findById,
  listActiveKeys,
  revokeKey,
  markUsed,
  rotateKey,
  completeRotation,
};
