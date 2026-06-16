const {
  INTEGRATION_SCOPES,
  ALL_INTEGRATION_SCOPES,
  isKnownScope,
  assertKnownScopes,
} = require('./registry');
const {
  normalizeScopeList,
  hasScope,
  hasAllScopes,
  hasAnyScope,
} = require('./validation');
const { requireScopes } = require('./require-scopes');
const {
  INTEGRATION_SCOPE_ERROR,
  sendInsufficientScopeError,
} = require('./errors');

module.exports = {
  INTEGRATION_SCOPES,
  ALL_INTEGRATION_SCOPES,
  isKnownScope,
  assertKnownScopes,
  normalizeScopeList,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  requireScopes,
  INTEGRATION_SCOPE_ERROR,
  sendInsufficientScopeError,
};
