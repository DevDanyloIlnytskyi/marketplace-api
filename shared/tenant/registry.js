const fs = require('fs');
const path = require('path');

const { TenantResolutionError } = require('./errors');

const DEFAULT_REGISTRY_PATH = path.join(
  __dirname,
  '..',
  '..',
  'config',
  'clients.json',
);

/** @type {{ version: number; clients: import('./config').ClientRecord[] } | null} */
let cachedRegistry = null;
/** @type {string | null} */
let cachedRegistryPath = null;
/** @type {number | null} */
let cachedMtimeMs = null;

/**
 * @typedef {import('./config').ClientRecord} ClientRecord
 */

function getRegistryPath() {
  return process.env.TENANT_REGISTRY_PATH || DEFAULT_REGISTRY_PATH;
}

/**
 * @returns {{ version: number; clients: ClientRecord[] }}
 */
function loadRegistryFile() {
  const registryPath = getRegistryPath();
  let raw;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch (err) {
    throw new TenantResolutionError(
      'REGISTRY_ERROR',
      `Tenant registry not found: ${registryPath}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TenantResolutionError(
      'REGISTRY_ERROR',
      `Tenant registry is invalid JSON: ${registryPath}`,
    );
  }

  if (!parsed || !Array.isArray(parsed.clients)) {
    throw new TenantResolutionError(
      'REGISTRY_ERROR',
      'Tenant registry must contain a "clients" array',
    );
  }

  return parsed;
}

/**
 * Read registry from disk (cached until file mtime changes).
 * @returns {{ version: number; clients: ClientRecord[] }}
 */
function loadRegistry() {
  const registryPath = getRegistryPath();
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(registryPath).mtimeMs;
  } catch {
    cachedRegistry = null;
    return loadRegistryFile();
  }

  if (
    cachedRegistry &&
    cachedRegistryPath === registryPath &&
    cachedMtimeMs === mtimeMs
  ) {
    return cachedRegistry;
  }

  const registry = loadRegistryFile();
  cachedRegistry = registry;
  cachedRegistryPath = registryPath;
  cachedMtimeMs = mtimeMs;
  return registry;
}

/** Clear in-memory registry cache (tests / hot reload). */
function clearRegistryCache() {
  cachedRegistry = null;
  cachedRegistryPath = null;
  cachedMtimeMs = null;
}

/**
 * @param {ClientRecord} record
 * @returns {import('./config').TenantConfig}
 */
function toTenantConfig(record) {
  return {
    id: record.id,
    name: record.name,
    domain: record.domain,
    database: record.database,
    storage: record.storage,
    active: record.active !== false,
    dialect: record.dialect,
  };
}

/**
 * @returns {Record<string, import('./config').TenantConfig>}
 */
function buildDomainIndex() {
  const { clients } = loadRegistry();
  /** @type {Record<string, import('./config').TenantConfig>} */
  const index = {};

  for (const record of clients) {
    if (!record.domain || typeof record.domain !== 'string') {
      continue;
    }
    const key = record.domain.toLowerCase();
    index[key] = toTenantConfig(record);
  }

  return index;
}

/**
 * @returns {import('./config').TenantConfig[]}
 */
function listTenants() {
  const { clients } = loadRegistry();
  return clients.map(toTenantConfig);
}

/**
 * Find tenant by canonical domain (already normalized).
 * @param {string} domain
 * @returns {import('./config').TenantConfig | null}
 */
function findTenantByDomain(domain) {
  if (!domain) {
    return null;
  }
  const index = buildDomainIndex();
  return index[domain] ?? null;
}

/**
 * Find tenant by MySQL database name.
 * @param {string} database
 * @returns {import('./config').TenantConfig | null}
 */
function findTenantByDatabase(database) {
  if (!database) {
    return null;
  }
  const match = listTenants().find((t) => t.database === database);
  return match ?? null;
}

module.exports = {
  getRegistryPath,
  loadRegistry,
  clearRegistryCache,
  buildDomainIndex,
  listTenants,
  findTenantByDomain,
  findTenantByDatabase,
  toTenantConfig,
};
