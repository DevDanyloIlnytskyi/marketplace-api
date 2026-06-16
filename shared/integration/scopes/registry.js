/**
 * Canonical integration scope identifiers (Platform-4.5.3).
 * Use these constants — do not hardcode scope strings elsewhere.
 */
const INTEGRATION_SCOPES = Object.freeze({
  CATALOG_READ: 'catalog.read',
  CATALOG_WRITE: 'catalog.write',

  PRICES_READ: 'prices.read',
  PRICES_WRITE: 'prices.write',

  STOCK_READ: 'stock.read',
  STOCK_WRITE: 'stock.write',

  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',

  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',

  MEDIA_READ: 'media.read',
  MEDIA_WRITE: 'media.write',

  SYNC_READ: 'sync.read',
  SYNC_WRITE: 'sync.write',

  INTEGRATION_LOGS_READ: 'integration.logs.read',
  INTEGRATION_KEYS_MANAGE: 'integration.keys.manage',

  ADMIN_INTEGRATION: 'admin.integration',
});

/** All registered scope string values. */
const ALL_INTEGRATION_SCOPES = Object.freeze(Object.values(INTEGRATION_SCOPES));

const KNOWN_SCOPE_SET = new Set(ALL_INTEGRATION_SCOPES);

/**
 * @param {string} scope
 * @returns {boolean}
 */
function isKnownScope(scope) {
  return KNOWN_SCOPE_SET.has(scope);
}

/**
 * @param {string[]} scopes
 */
function assertKnownScopes(scopes) {
  for (const scope of scopes) {
    if (!isKnownScope(scope)) {
      throw new Error(`Unknown integration scope: ${scope}`);
    }
  }
}

module.exports = {
  INTEGRATION_SCOPES,
  ALL_INTEGRATION_SCOPES,
  isKnownScope,
  assertKnownScopes,
};
