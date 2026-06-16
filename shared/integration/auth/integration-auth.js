const { findByHash, markUsed } = require('../keys/repository');
const { hashIntegrationApiKey } = require('../keys/hash-key');
const {
  isActive,
  isExpired,
  isRevoked,
  validateTenantBinding,
} = require('../keys/validation');
const {
  INTEGRATION_AUTH_ERROR,
  sendIntegrationAuthError,
} = require('./errors');
const {
  attachIntegrationAuditTracking,
  setIntegrationAuditKeyId,
} = require('../audit/integration-audit');

/**
 * Build request integration context from a key row (no plaintext key).
 * @param {import('sequelize').Model} record
 */
function buildIntegrationContext(record) {
  const plain = record.get ? record.get({ plain: true }) : record;
  return {
    keyId: plain.id,
    tenantId: plain.tenant_id,
    label: plain.label,
    scopes: plain.scopes,
    keyPrefix: plain.key_prefix,
    expiresAt: plain.expires_at ?? null,
  };
}

/**
 * Fire-and-forget last_used_at update — must not block the request pipeline.
 * @param {import('express').Request} req
 * @param {string} keyId
 */
function scheduleMarkUsed(req, keyId) {
  setImmediate(() => {
    markUsed(req.models, keyId).catch((error) => {
      console.error('[integration-auth] markUsed failed', {
        keyId,
        tenant: req.tenant?.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
}

/**
 * Integration Layer authentication via X-API-Key (DB-backed keys).
 * Requires tenantMiddleware first (req.tenant, req.models).
 *
 * Not used on legacy routes — isolated from authenticate.js / JWT.
 */
async function integrationAuth(req, res, next) {
  try {
    attachIntegrationAuditTracking(req, res);

    if (!req.tenant || !req.models) {
      return next(
        new Error('integrationAuth requires tenantMiddleware (req.tenant, req.models)'),
      );
    }

    const presentedKey = String(req.get('x-api-key') || '').trim();
    if (!presentedKey) {
      res.locals.integrationErrorCode = INTEGRATION_AUTH_ERROR.MISSING_API_KEY;
      return sendIntegrationAuthError(
        res,
        401,
        INTEGRATION_AUTH_ERROR.MISSING_API_KEY,
        req,
      );
    }

    const keyHash = hashIntegrationApiKey(presentedKey);
    const record = await findByHash(req.models, keyHash);

    if (!record) {
      res.locals.integrationErrorCode = INTEGRATION_AUTH_ERROR.INVALID_API_KEY;
      return sendIntegrationAuthError(
        res,
        401,
        INTEGRATION_AUTH_ERROR.INVALID_API_KEY,
        req,
      );
    }

    setIntegrationAuditKeyId(req, record.id);

    const binding = validateTenantBinding(record, req.tenant, presentedKey);
    if (!binding.valid) {
      res.locals.integrationErrorCode = INTEGRATION_AUTH_ERROR.TENANT_MISMATCH;
      return sendIntegrationAuthError(
        res,
        403,
        INTEGRATION_AUTH_ERROR.TENANT_MISMATCH,
        req,
      );
    }

    if (isRevoked(record)) {
      res.locals.integrationErrorCode = INTEGRATION_AUTH_ERROR.REVOKED_API_KEY;
      return sendIntegrationAuthError(
        res,
        403,
        INTEGRATION_AUTH_ERROR.REVOKED_API_KEY,
        req,
      );
    }

    if (isExpired(record.expires_at)) {
      res.locals.integrationErrorCode = INTEGRATION_AUTH_ERROR.EXPIRED_API_KEY;
      return sendIntegrationAuthError(
        res,
        403,
        INTEGRATION_AUTH_ERROR.EXPIRED_API_KEY,
        req,
      );
    }

    if (!isActive(record)) {
      res.locals.integrationErrorCode = INTEGRATION_AUTH_ERROR.INVALID_API_KEY;
      return sendIntegrationAuthError(
        res,
        401,
        INTEGRATION_AUTH_ERROR.INVALID_API_KEY,
        req,
      );
    }

    req.integration = buildIntegrationContext(record);
    scheduleMarkUsed(req, req.integration.keyId);
    return next();
  } catch (error) {
    res.locals.integrationErrorCode = 'INTERNAL_ERROR';
    console.error('[integration-auth] unexpected error', {
      tenant: req.tenant?.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return next(error);
  }
}

module.exports = {
  integrationAuth,
  buildIntegrationContext,
};
