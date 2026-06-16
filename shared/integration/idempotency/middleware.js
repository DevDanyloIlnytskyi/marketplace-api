const {
  INTEGRATION_ERROR_CODE,
  INTEGRATION_ERROR_MESSAGE,
  errorResponse,
} = require('../http');
const {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
} = require('./constants');
const { claimOrReplay } = require('./service');
const { attachIdempotencyResponseCapture } = require('./response-capture');

/**
 * Integration idempotency middleware for write routes (Platform-5.3).
 * Must run after integrationAuth (requires req.integration.keyId).
 *
 * @param {{ required?: boolean }} [options]
 * @returns {import('express').RequestHandler}
 */
function integrationIdempotency(options = {}) {
  const required = options.required !== false;

  return async function integrationIdempotencyMiddleware(req, res, next) {
    const presentedKey = String(req.get(IDEMPOTENCY_KEY_HEADER) || '').trim();

    if (!presentedKey) {
      if (!required) {
        return next();
      }
      return errorResponse(res, req, {
        code: INTEGRATION_ERROR_CODE.IDEMPOTENCY_KEY_REQUIRED,
        message: INTEGRATION_ERROR_MESSAGE.IDEMPOTENCY_KEY_REQUIRED,
        status: 400,
      });
    }

    if (presentedKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      return errorResponse(res, req, {
        code: INTEGRATION_ERROR_CODE.VALIDATION_ERROR,
        message: 'Idempotency-Key exceeds maximum length.',
        details: { maxLength: IDEMPOTENCY_KEY_MAX_LENGTH },
        status: 400,
      });
    }

    try {
      const decision = await claimOrReplay(req, presentedKey);

      if (decision.action === 'replay') {
        res.setHeader('X-Idempotent-Replay', 'true');
        res.setHeader('X-API-Version', 'v1');
        if (req.requestId) {
          res.setHeader('X-Request-Id', req.requestId);
        }
        return res.status(decision.statusCode).json(decision.responseBody);
      }

      if (decision.action === 'conflict') {
        /** @type {Record<string, unknown>} */
        const details = {
          idempotencyKey: presentedKey,
          reason: decision.reason,
        };
        if (decision.originalRequestId) {
          details.originalRequestId = decision.originalRequestId;
        }

        return errorResponse(res, req, {
          code: INTEGRATION_ERROR_CODE.IDEMPOTENCY_CONFLICT,
          message: INTEGRATION_ERROR_MESSAGE.IDEMPOTENCY_CONFLICT,
          details,
          status: 409,
        });
      }

      attachIdempotencyResponseCapture(req, res, decision.recordId);
      return next();
    } catch (error) {
      console.error('[integration-idempotency] store error', {
        tenant: req.tenant?.id,
        requestId: req.requestId,
        message: error instanceof Error ? error.message : String(error),
      });

      return errorResponse(res, req, {
        code: INTEGRATION_ERROR_CODE.IDEMPOTENCY_STORE_FAILURE,
        message: INTEGRATION_ERROR_MESSAGE.IDEMPOTENCY_STORE_FAILURE,
        status: 500,
      });
    }
  };
}

module.exports = {
  integrationIdempotency,
};
