const { extractTenantSlugFromKey } = require('./generate-key');
const {
  AUTHENTICATABLE_STATUSES,
  INTEGRATION_KEY_STATUS,
} = require('./constants');

/**
 * @param {Date | string | null | undefined} expiresAt
 * @param {Date} [now]
 * @returns {boolean}
 */
function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) {
    return false;
  }
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return false;
  }
  return expiry.getTime() < now.getTime();
}

/**
 * @param {{ status?: string, revoked_at?: Date | string | null }} keyRow
 * @returns {boolean}
 */
function isRevoked(keyRow) {
  if (!keyRow) {
    return true;
  }
  if (keyRow.status === INTEGRATION_KEY_STATUS.REVOKED) {
    return true;
  }
  return Boolean(keyRow.revoked_at);
}

/**
 * Key may authenticate: active or rotating lifecycle, not revoked/expired.
 * @param {{ status?: string, expires_at?: Date | string | null, revoked_at?: Date | string | null }} keyRow
 * @param {Date} [now]
 * @returns {boolean}
 */
function isActive(keyRow, now = new Date()) {
  if (!keyRow || isRevoked(keyRow)) {
    return false;
  }
  if (keyRow.status === INTEGRATION_KEY_STATUS.EXPIRED) {
    return false;
  }
  if (!AUTHENTICATABLE_STATUSES.includes(keyRow.status)) {
    return false;
  }
  return !isExpired(keyRow.expires_at, now);
}

/**
 * Validate key row belongs to resolved tenant and wire prefix matches.
 * @param {{ tenant_id?: string }} keyRow
 * @param {{ id: string }} tenant
 * @param {string} [presentedKey] — full wire key for prefix slug check
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateTenantBinding(keyRow, tenant, presentedKey) {
  if (!keyRow || !tenant) {
    return { valid: false, reason: 'missing_context' };
  }

  const expectedTenantId = String(tenant.id).trim().toLowerCase();
  const keyTenantId = String(keyRow.tenant_id || '')
    .trim()
    .toLowerCase();

  if (keyTenantId !== expectedTenantId) {
    return { valid: false, reason: 'tenant_id_mismatch' };
  }

  if (presentedKey) {
    const slugFromKey = extractTenantSlugFromKey(presentedKey);
    if (!slugFromKey || slugFromKey !== expectedTenantId) {
      return { valid: false, reason: 'key_prefix_tenant_mismatch' };
    }
  }

  return { valid: true };
}

module.exports = {
  isExpired,
  isRevoked,
  isActive,
  validateTenantBinding,
};
