const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../../config/api-keys.json');

/** @type {{ version: number, keys: Array<{ id: string, key?: string, keyHash?: string, tenantId: string, active?: boolean, label?: string }> } | null} */
let cachedRegistry = null;
let cachedMtimeMs = 0;

function loadRegistry() {
  try {
    const stat = fs.statSync(REGISTRY_PATH);
    if (cachedRegistry && stat.mtimeMs === cachedMtimeMs) {
      return cachedRegistry;
    }
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    cachedRegistry = JSON.parse(raw);
    cachedMtimeMs = stat.mtimeMs;
    return cachedRegistry;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      cachedRegistry = null;
      cachedMtimeMs = 0;
      return null;
    }
    throw error;
  }
}

function isApiKeyAuthEnabled() {
  if (process.env.API_KEY_AUTH_ENABLED === 'false') {
    return false;
  }
  if (process.env.API_KEY_AUTH_ENABLED === 'true') {
    return true;
  }
  return loadRegistry() !== null;
}

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * SHA-256 hex digest of an API key (stored in registry as keyHash).
 * @param {string} key
 * @returns {string}
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

/**
 * @param {{ key?: string, keyHash?: string }} entry
 * @param {string} presentedKey
 * @returns {boolean}
 */
function entryMatchesKey(entry, presentedKey) {
  if (entry.keyHash) {
    return timingSafeEqualStrings(hashApiKey(presentedKey), entry.keyHash);
  }
  if (entry.key) {
    return timingSafeEqualStrings(presentedKey, entry.key);
  }
  return false;
}

/**
 * Validate X-API-Key against tenant-scoped registry entry.
 * @param {string | undefined} presentedKey
 * @param {{ id: string } | undefined} tenant
 * @returns {{ valid: true, keyId: string } | { valid: false }}
 */
function validateApiKey(presentedKey, tenant) {
  if (!presentedKey || !tenant) {
    return { valid: false };
  }

  const registry = loadRegistry();
  if (!registry || !Array.isArray(registry.keys)) {
    return { valid: false };
  }

  for (const entry of registry.keys) {
    if (!entry || entry.active === false) {
      continue;
    }
    if (entry.tenantId !== tenant.id) {
      continue;
    }
    if (entryMatchesKey(entry, presentedKey)) {
      return { valid: true, keyId: entry.id };
    }
  }

  return { valid: false };
}

function clearApiKeyRegistryCache() {
  cachedRegistry = null;
  cachedMtimeMs = 0;
}

module.exports = {
  isApiKeyAuthEnabled,
  validateApiKey,
  hashApiKey,
  clearApiKeyRegistryCache,
  loadRegistry,
};
