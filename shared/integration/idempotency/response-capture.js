const { finalizeSuccess, finalizeFailure } = require('./service');

/**
 * Intercept res.json / res.status to capture handler output for idempotency replay.
 * Only 2xx responses are persisted; failures release the pending slot.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number | string} recordId
 */
function attachIdempotencyResponseCapture(req, res, recordId) {
  if (req.idempotencyCaptureAttached) {
    return;
  }
  req.idempotencyCaptureAttached = true;
  req.idempotencyRecordId = recordId;

  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);

  let statusCode = res.statusCode || 200;
  /** @type {unknown} */
  let responseBody = null;

  res.status = function status(code) {
    statusCode = code;
    return originalStatus(code);
  };

  res.json = function json(body) {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    if (!req.models || !req.idempotencyRecordId) {
      return;
    }

    const finalStatus = res.statusCode || statusCode;
    const isSuccess = finalStatus >= 200 && finalStatus < 300;

    setImmediate(async () => {
      try {
        if (isSuccess && responseBody !== null) {
          await finalizeSuccess(req.models, req.idempotencyRecordId, {
            statusCode: finalStatus,
            responseBody,
          });
        } else {
          await finalizeFailure(req.models, req.idempotencyRecordId);
        }
      } catch (error) {
        console.error('[integration-idempotency] finalize failed', {
          tenant: req.tenant?.id,
          recordId: req.idempotencyRecordId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });
}

module.exports = {
  attachIdempotencyResponseCapture,
};
