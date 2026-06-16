const {
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_STATUS,
} = require('./constants');
const {
  computeRequestFingerprint,
  resolveFingerprintPath,
} = require('./request-fingerprint');
const {
  createPending,
  findActive,
  completeRecord,
  deleteRecord,
  deleteExpired,
  findById,
} = require('./repository');

const IN_PROGRESS_POLL_MS = 100;
const IN_PROGRESS_MAX_WAIT_MS = 5000;

function isUniqueConstraintError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = error.name || '';
  if (name === 'SequelizeUniqueConstraintError') {
    return true;
  }
  const code = error.original?.code || error.parent?.code;
  return code === 'ER_DUP_ENTRY' || code === '23505';
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildExpiresAt(now = new Date()) {
  return new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
}

/**
 * @param {import('sequelize').Model} record
 */
function toPlain(record) {
  return record.get ? record.get({ plain: true }) : record;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {object} record
 * @param {string} requestHash
 */
async function resolveExisting(models, record, requestHash) {
  if (record.request_hash !== requestHash) {
    return {
      action: 'conflict',
      reason: 'HASH_MISMATCH',
      originalRequestId: record.request_id,
    };
  }

  if (record.status === IDEMPOTENCY_STATUS.COMPLETED) {
    return {
      action: 'replay',
      statusCode: record.status_code,
      responseBody: record.response_body,
    };
  }

  const deadline = Date.now() + IN_PROGRESS_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(IN_PROGRESS_POLL_MS);
    const refreshed = await findById(models, record.id);
    if (!refreshed) {
      break;
    }
    const plain = toPlain(refreshed);
    if (plain.status === IDEMPOTENCY_STATUS.COMPLETED) {
      return {
        action: 'replay',
        statusCode: plain.status_code,
        responseBody: plain.response_body,
      };
    }
  }

  return {
    action: 'conflict',
    reason: 'REQUEST_IN_PROGRESS',
    originalRequestId: record.request_id,
  };
}

/**
 * Claim idempotency slot or return replay/conflict decision.
 *
 * @param {import('express').Request} req
 * @param {string} idempotencyKey
 */
async function claimOrReplay(req, idempotencyKey) {
  if (!req.models || !req.tenant || !req.integration?.keyId) {
    throw new Error('claimOrReplay requires tenant, models, and req.integration.keyId');
  }

  const requestHash = computeRequestFingerprint(req);
  const routePath = resolveFingerprintPath(req);
  const lookup = {
    tenantId: req.tenant.id,
    apiKeyId: req.integration.keyId,
    idempotencyKey,
  };

  const existing = await findActive(req.models, lookup);
  if (existing) {
    return resolveExisting(req.models, toPlain(existing), requestHash);
  }

  try {
    const created = await createPending(req.models, {
      tenantId: req.tenant.id,
      apiKeyId: req.integration.keyId,
      idempotencyKey,
      requestHash,
      httpMethod: String(req.method || 'POST').toUpperCase(),
      routePath,
      requestId: req.requestId,
      expiresAt: buildExpiresAt(),
    });

    return { action: 'proceed', recordId: created.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const raced = await findActive(req.models, lookup);
    if (!raced) {
      await sleep(50);
      const retried = await findActive(req.models, lookup);
      if (!retried) {
        throw error;
      }
      return resolveExisting(req.models, toPlain(retried), requestHash);
    }
    return resolveExisting(req.models, toPlain(raced), requestHash);
  }
}

/**
 * Persist successful response for replay.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number | string} recordId
 * @param {{ statusCode: number, responseBody: unknown }} result
 */
async function finalizeSuccess(models, recordId, result) {
  await completeRecord(models, recordId, result);
}

/**
 * Release pending slot after non-successful write.
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {number | string} recordId
 */
async function finalizeFailure(models, recordId) {
  await deleteRecord(models, recordId);
}

module.exports = {
  claimOrReplay,
  finalizeSuccess,
  finalizeFailure,
  deleteExpired,
  buildExpiresAt,
  computeRequestFingerprint,
  resolveFingerprintPath,
};
