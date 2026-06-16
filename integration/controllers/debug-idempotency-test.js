const { successResponse } = require('../../shared/integration/http');

/**
 * Debug handler — no business logic; validates idempotency middleware only.
 */
function postIdempotencyTest(req, res) {
  return successResponse(res, req, {
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  postIdempotencyTest,
};
