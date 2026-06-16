const { INTEGRATION_API_VERSION } = require('./constants');

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {unknown} data
 * @param {number} [status=200]
 */
function successResponse(res, req, data, status = 200) {
  if (req.requestId) {
    res.setHeader('X-Request-Id', req.requestId);
  }
  res.setHeader('X-API-Version', INTEGRATION_API_VERSION);

  return res.status(status).json({
    success: true,
    requestId: req.requestId,
    data,
  });
}

/**
 * @param {import('express').Response} res
 * @param {import('express').Request} req
 * @param {{ code: string, message?: string, details?: unknown, status?: number }} options
 */
function errorResponse(res, req, { code, message, details, status = 400 }) {
  if (req.requestId) {
    res.setHeader('X-Request-Id', req.requestId);
  }
  res.setHeader('X-API-Version', INTEGRATION_API_VERSION);
  res.locals.integrationErrorCode = code;

  /** @type {Record<string, unknown>} */
  const body = {
    success: false,
    code,
    message: message || code,
    requestId: req.requestId,
  };

  if (details !== undefined) {
    body.details = details;
  }

  return res.status(status).json(body);
}

module.exports = {
  successResponse,
  errorResponse,
};
