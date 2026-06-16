const express = require('express');
const { integrationAuth } = require('../../shared/integration/auth');
const { integrationAudit } = require('../../shared/integration/audit');
const {
  requireScopes,
  INTEGRATION_SCOPES,
} = require('../../shared/integration/scopes');
const router = express.Router();

/**
 * GET /api/internal/scope-test/read
 * Requires catalog.read — scope validation test only (Platform-4.5.3).
 */
router.get(
  '/scope-test/read',
  integrationAuth,
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  integrationAudit,
  (req, res) => {
    res.status(200).json({
      success: true,
      scope: INTEGRATION_SCOPES.CATALOG_READ,
      integration: req.integration,
    });
  },
);

/**
 * POST /api/internal/scope-test/write
 * Requires catalog.write — scope validation test only (Platform-4.5.3).
 */
router.post(
  '/scope-test/write',
  integrationAuth,
  requireScopes(INTEGRATION_SCOPES.CATALOG_WRITE),
  integrationAudit,
  (req, res) => {
    res.status(200).json({
      success: true,
      scope: INTEGRATION_SCOPES.CATALOG_WRITE,
      integration: req.integration,
    });
  },
);

module.exports = router;
