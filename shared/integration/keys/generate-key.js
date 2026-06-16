const crypto = require('crypto');

const {
  KEY_WIRE_PREFIX,
  KEY_PREFIX_DISPLAY_LENGTH,
  KEY_RANDOM_BYTES,
} = require('./constants');

const TENANT_SLUG_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Normalize tenant slug for wire key format.
 * @param {string} tenantSlug
 * @returns {string}
 */
function normalizeTenantSlug(tenantSlug) {
  const normalized = String(tenantSlug).trim().toLowerCase();
  if (!normalized || !TENANT_SLUG_PATTERN.test(normalized)) {
    throw new Error(
      `Invalid tenant slug for integration key: "${tenantSlug}"`,
    );
  }
  return normalized;
}

/**
 * Extract tenant slug from wire-format key: mpk_<tenantSlug>_<random>
 * @param {string} apiKey
 * @returns {string | null}
 */
function extractTenantSlugFromKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return null;
  }
  if (!apiKey.startsWith(KEY_WIRE_PREFIX)) {
    return null;
  }
  const withoutPrefix = apiKey.slice(KEY_WIRE_PREFIX.length);
  const separatorIndex = withoutPrefix.indexOf('_');
  if (separatorIndex <= 0) {
    return null;
  }
  const slug = withoutPrefix.slice(0, separatorIndex).toLowerCase();
  return TENANT_SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Generate a cryptographically secure integration API key.
 * Format: mpk_<tenantSlug>_<randomBase64url>
 * @param {string} tenantSlug — must match registry tenant id (e.g. avtoleg)
 * @returns {{ apiKey: string, keyPrefix: string }}
 */
function generateIntegrationApiKey(tenantSlug) {
  const slug = normalizeTenantSlug(tenantSlug);
  const randomPart = crypto.randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const apiKey = `${KEY_WIRE_PREFIX}${slug}_${randomPart}`;
  const keyPrefix = apiKey.slice(0, KEY_PREFIX_DISPLAY_LENGTH);
  return { apiKey, keyPrefix };
}

module.exports = {
  generateIntegrationApiKey,
  extractTenantSlugFromKey,
  normalizeTenantSlug,
};
