const { isJsonRequest, isMultipartRequest } = require('./content-type-detect');

/**
 * Run a Connect-style middleware that uses next(err).
 *
 * @param {import('express').RequestHandler} middleware
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<void>}
 */
function runMiddleware(middleware, req, res) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Branch Integration write routes by Content-Type without duplicating route paths.
 *
 * JSON chain: unchanged idempotency-before-handler order.
 * Multipart chain: staging → fingerprint → idempotency → promote → handler.
 *
 * @param {import('express').RequestHandler[]} jsonBeforeHandler
 * @param {import('express').RequestHandler[]} multipartBeforeHandler
 * @param {import('express').RequestHandler} handler
 * @returns {import('express').RequestHandler}
 */
function branchIntegrationWriteMiddleware(jsonBeforeHandler, multipartBeforeHandler, handler) {
  return async function branchIntegrationWrite(req, res, next) {
    try {
      const before = isMultipartRequest(req) ? multipartBeforeHandler : jsonBeforeHandler;

      for (const middleware of before) {
        await runMiddleware(middleware, req, res);
        if (res.headersSent) {
          return;
        }
      }

      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  isJsonRequest,
  isMultipartRequest,
  runMiddleware,
  branchIntegrationWriteMiddleware,
};
