const {
  successResponse,
  notFoundError,
  INTEGRATION_API_VERSION,
} = require('../../shared/integration/http');

function getHealth(req, res) {
  return successResponse(res, req, {
    status: 'ok',
    version: INTEGRATION_API_VERSION,
    tenantId: req.tenant?.id ?? null,
    timestamp: new Date().toISOString(),
  });
}

function getWhoami(req, res) {
  return successResponse(res, req, {
    tenantId: req.integration.tenantId,
    keyId: req.integration.keyId,
    keyPrefix: req.integration.keyPrefix,
    label: req.integration.label,
    scopes: req.integration.scopes,
    expiresAt: req.integration.expiresAt ?? null,
  });
}

module.exports = {
  getHealth,
  getWhoami,
};
