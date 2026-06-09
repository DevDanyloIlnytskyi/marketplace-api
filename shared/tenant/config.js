/**
 * Tenant types — registry data lives in config/clients.json (see registry.js).
 *
 * @typedef {Object} ClientRecord
 * @property {string} id - Stable tenant identifier
 * @property {string} name - Display name (BaseInfo marketing)
 * @property {string} domain - Canonical host (no port)
 * @property {string} database - Database name (MySQL or PostgreSQL per dialect)
 * @property {string} storage - Storage subdirectory key under storage/
 * @property {boolean} [active] - When false, tenant is rejected (403)
 * @property {string} [dialect] - Optional per-tenant override: mysql | postgres
 *
 * @typedef {Object} TenantConfig
 * @property {string} id
 * @property {string} name
 * @property {string} domain
 * @property {string} database
 * @property {string} storage
 * @property {boolean} active
 * @property {string} [dialect]
 */

module.exports = {};
