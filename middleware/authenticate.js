const passport = require('passport');
const {
  isApiKeyAuthEnabled,
  validateApiKey,
} = require('../shared/auth/api-keys');

/**
 * Protected-route auth: API Key (X-API-Key) first, then JWT.
 * Backward compatible — when API key auth is disabled, behaves as JWT-only.
 */
function authenticate(req, res, next) {
  const apiKeyHeader = req.get('x-api-key');
  const apiKeyEnabled = isApiKeyAuthEnabled();

  if (apiKeyHeader && apiKeyEnabled) {
    const result = validateApiKey(apiKeyHeader, req.tenant);
    if (result.valid) {
      req.user = {
        login: `api-key:${result.keyId}`,
        isApiKey: true,
      };
      req.authMethod = 'api-key';
      return next();
    }
    return res.status(401).json({
      message: 'Invalid API key',
    });
  }

  if (apiKeyHeader && !apiKeyEnabled) {
    return res.status(401).json({
      message: 'API key authentication is not enabled',
    });
  }

  req.authMethod = 'jwt';
  return passport.authenticate('jwt', { session: false })(req, res, next);
}

module.exports = authenticate;
