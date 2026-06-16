const express = require('express');
const { integrationAuth } = require('../../shared/integration/auth');
const { integrationAudit } = require('../../shared/integration/audit');

const router = express.Router();

/**
 * GET /api/internal/integration-auth-test
 * Technical endpoint — verifies integrationAuth middleware only (Platform-4.5.2).
 */
router.get('/integration-auth-test', integrationAuth, integrationAudit, (req, res) => {
  res.status(200).json({
    success: true,
    requestId: req.integrationAudit?.requestId,
    integration: req.integration,
  });
});

module.exports = router;
