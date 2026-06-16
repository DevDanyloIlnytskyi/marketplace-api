const { INTEGRATION_SCOPES } = require('./registry');

/**
 * @param {unknown} scopes
 * @returns {string[]}
 */
function normalizeScopeList(scopes) {
  if (!Array.isArray(scopes)) {
    return [];
  }
  return scopes
    .map((scope) => String(scope).trim())
    .filter(Boolean);
}

/**
 * Super-scope: admin.integration satisfies any single scope check.
 * @param {string[]} keyScopes
 * @returns {boolean}
 */
function hasAdminIntegrationScope(keyScopes) {
  return normalizeScopeList(keyScopes).includes(
    INTEGRATION_SCOPES.ADMIN_INTEGRATION,
  );
}

/**
 * @param {string[] | unknown} keyScopes — req.integration.scopes
 * @param {string} requiredScope
 * @returns {boolean}
 */
function hasScope(keyScopes, requiredScope) {
  const normalized = normalizeScopeList(keyScopes);
  if (hasAdminIntegrationScope(normalized)) {
    return true;
  }
  return normalized.includes(requiredScope);
}

/**
 * All required scopes must be present (AND).
 * @param {string[] | unknown} keyScopes
 * @param {string[]} requiredScopes
 * @returns {boolean}
 */
function hasAllScopes(keyScopes, requiredScopes) {
  const required = normalizeScopeList(requiredScopes);
  if (required.length === 0) {
    return true;
  }
  return required.every((scope) => hasScope(keyScopes, scope));
}

/**
 * At least one required scope must be present (OR).
 * @param {string[] | unknown} keyScopes
 * @param {string[]} requiredScopes
 * @returns {boolean}
 */
function hasAnyScope(keyScopes, requiredScopes) {
  const required = normalizeScopeList(requiredScopes);
  if (required.length === 0) {
    return true;
  }
  return required.some((scope) => hasScope(keyScopes, scope));
}

module.exports = {
  normalizeScopeList,
  hasScope,
  hasAllScopes,
  hasAnyScope,
};
