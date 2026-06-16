const crypto = require('crypto');

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Resolve client-provided or generate a new request id.
 * @param {import('express').Request} req
 */
function resolveRequestId(req) {
  const presented = String(req.get(REQUEST_ID_HEADER) || '').trim();
  if (presented && presented.length <= MAX_REQUEST_ID_LENGTH) {
    return presented;
  }
  return crypto.randomUUID();
}

/**
 * Platform-5.2 — correlation id for /api/integration/v1/* only.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function integrationRequestId(req, res, next) {
  req.requestId = resolveRequestId(req);
  res.setHeader('X-Request-Id', req.requestId);
  return next();
}

module.exports = {
  integrationRequestId,
  resolveRequestId,
};
