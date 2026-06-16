const { INTEGRATION_ERROR_MESSAGE } = require('../http/constants');
const { assertKnownScopes } = require('./registry');
const { hasAllScopes } = require('./validation');
const {
  INTEGRATION_SCOPE_ERROR,
  sendInsufficientScopeError,
} = require('./errors');

/**
 * Express middleware factory — requires all listed scopes on req.integration.
 * Must run after integrationAuth.
 *
 * @param {...string} requiredScopes
 * @returns {import('express').RequestHandler}
 */
function requireScopes(...requiredScopes) {
  const required = requiredScopes.flat().map((scope) => String(scope).trim());
  assertKnownScopes(required);

  return function requireScopesMiddleware(req, res, next) {
    if (!req.integration || !Array.isArray(req.integration.scopes)) {
      res.locals.integrationErrorCode =
        INTEGRATION_SCOPE_ERROR.INTEGRATION_AUTH_REQUIRED;

      /** @type {Record<string, unknown>} */
      const body = {
        success: false,
        code: INTEGRATION_SCOPE_ERROR.INTEGRATION_AUTH_REQUIRED,
        message: INTEGRATION_ERROR_MESSAGE.INTEGRATION_AUTH_REQUIRED,
        requestId: req.requestId,
      };

      if (req.requestId) {
        res.setHeader('X-Request-Id', req.requestId);
      }

      return res.status(401).json(body);
    }

    if (!hasAllScopes(req.integration.scopes, required)) {
      res.locals.integrationErrorCode =
        INTEGRATION_SCOPE_ERROR.INSUFFICIENT_SCOPE;
      return sendInsufficientScopeError(res, req, required);
    }

    return next();
  };
}

module.exports = {
  requireScopes,
};
