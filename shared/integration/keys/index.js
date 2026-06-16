const {
  INTEGRATION_KEY_STATUS,
  AUTHENTICATABLE_STATUSES,
  KEY_WIRE_PREFIX,
  KEY_PREFIX_DISPLAY_LENGTH,
  KEY_RANDOM_BYTES,
} = require('./constants');
const { defineIntegrationApiKeyModel } = require('./define-model');
const { generateIntegrationApiKey, extractTenantSlugFromKey, normalizeTenantSlug } = require('./generate-key');
const { hashIntegrationApiKey, compareKeyHashes } = require('./hash-key');
const {
  isExpired,
  isRevoked,
  isActive,
  validateTenantBinding,
} = require('./validation');
const repository = require('./repository');

module.exports = {
  INTEGRATION_KEY_STATUS,
  AUTHENTICATABLE_STATUSES,
  KEY_WIRE_PREFIX,
  KEY_PREFIX_DISPLAY_LENGTH,
  KEY_RANDOM_BYTES,
  defineIntegrationApiKeyModel,
  generateIntegrationApiKey,
  extractTenantSlugFromKey,
  normalizeTenantSlug,
  hashIntegrationApiKey,
  compareKeyHashes,
  isExpired,
  isRevoked,
  isActive,
  validateTenantBinding,
  ...repository,
};
