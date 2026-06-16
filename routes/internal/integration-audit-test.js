const express = require('express');
const { integrationAuth } = require('../../shared/integration/auth');
const { integrationAudit } = require('../../shared/integration/audit');
const {
  requireScopes,
  INTEGRATION_SCOPES,
} = require('../../shared/integration/scopes');

const router = express.Router();

/**
 * GET /api/internal/integration-audit-test
 * Verifies full integration stack including async audit logging (Platform-4.5.4).
 */
router.get(
  '/integration-audit-test',
  integrationAuth,
  requireScopes(INTEGRATION_SCOPES.CATALOG_READ),
  integrationAudit,
  (req, res) => {
    res.status(200).json({
      success: true,
      requestId: req.integrationAudit?.requestId,
      integration: req.integration,
    });
  },
);

module.exports = router;
