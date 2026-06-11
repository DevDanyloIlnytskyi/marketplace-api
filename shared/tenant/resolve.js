const { TenantResolutionError } = require('./errors');
const {
  findTenantByDomain,
  findTenantByDatabase,
  findTenantById,
} = require('./registry');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Normalize Host / X-Marketplace-Host to lowercase hostname without port.
 * @param {string | undefined} host
 */
function normalizeHost(host) {
  if (!host || typeof host !== 'string') {
    return '';
  }
  const trimmed = host.split(',')[0].trim();
  const withoutPort = trimmed.includes(':') ? trimmed.split(':')[0] : trimmed;
  const normalized = withoutPort.toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(normalized) && !LOCAL_HOSTS.has(normalized)) {
    throw new TenantResolutionError(
      'INVALID_TENANT',
      `Invalid host header: ${host}`,
    );
  }
  return normalized;
}

/**
 * @param {string} tenantId
 */
function normalizeTenantId(tenantId) {
  const normalized = String(tenantId).trim().toLowerCase();
  if (!normalized || !/^[a-z0-9_-]+$/.test(normalized)) {
    throw new TenantResolutionError(
      'INVALID_TENANT',
      `Invalid tenant id header: ${tenantId}`,
    );
  }
  return normalized;
}

/**
 * @param {import('./config').TenantConfig} tenant
 */
function assertActiveTenant(tenant) {
  if (!tenant.active) {
    throw new TenantResolutionError(
      'INACTIVE_TENANT',
      `Tenant "${tenant.id}" is inactive for domain ${tenant.domain}`,
    );
  }
}

/**
 * Resolve tenant by registry id (service-to-service / BFF).
 * @param {string} tenantId
 * @returns {import('./config').TenantConfig}
 */
function resolveTenantById(tenantId) {
  const key = normalizeTenantId(tenantId);
  const tenant = findTenantById(key);
  if (!tenant) {
    throw new TenantResolutionError(
      'UNKNOWN_TENANT',
      `No tenant registered for id: ${key}`,
    );
  }
  assertActiveTenant(tenant);
  return tenant;
}

/**
 * Resolve tenant for localhost / 127.0.0.1 without silent wrong-tenant fallback.
 * @returns {import('./config').TenantConfig}
 */
function resolveLocalDevTenant() {
  const devDomain = process.env.TENANT_DEV_DOMAIN;
  if (devDomain) {
    const key = devDomain.toLowerCase();
    const tenant = findTenantByDomain(key);
    if (!tenant) {
      throw new TenantResolutionError(
        'UNKNOWN_HOST',
        `TENANT_DEV_DOMAIN="${devDomain}" is not registered`,
      );
    }
    assertActiveTenant(tenant);
    return tenant;
  }

  const envDb = process.env.database;
  if (envDb) {
    const tenant = findTenantByDatabase(envDb);
    if (tenant) {
      assertActiveTenant(tenant);
      return tenant;
    }
  }

  throw new TenantResolutionError(
    'UNKNOWN_HOST',
    'Local development host requires TENANT_DEV_DOMAIN (e.g. avtoleg.local) or a registered process.env.database',
  );
}

/**
 * Resolve tenant from incoming HTTP host (external / browser requests).
 * @param {string | undefined} host - Raw Host or X-Marketplace-Host header
 * @returns {import('./config').TenantConfig}
 */
function resolveTenant(host) {
  const key = normalizeHost(host);

  if (key && !LOCAL_HOSTS.has(key)) {
    const tenant = findTenantByDomain(key);
    if (!tenant) {
      throw new TenantResolutionError(
        'UNKNOWN_HOST',
        `No tenant registered for host: ${key}`,
      );
    }
    assertActiveTenant(tenant);
    return tenant;
  }

  if (key === '' || LOCAL_HOSTS.has(key)) {
    return resolveLocalDevTenant();
  }

  throw new TenantResolutionError(
    'INVALID_TENANT',
    `Unable to resolve tenant for host: ${host || '(empty)'}`,
  );
}

/**
 * Resolve tenant from Express request.
 *
 * Priority:
 *   1. X-Marketplace-Tenant (service-to-service; Host ignored when set)
 *   2. Host / X-Marketplace-Host (external storefront)
 *   3. reject
 *
 * @param {import('express').Request} req
 */
function resolveTenantFromRequest(req) {
  const tenantIdHeader = req.get('x-marketplace-tenant');
  if (tenantIdHeader && String(tenantIdHeader).trim()) {
    return resolveTenantById(tenantIdHeader);
  }

  const trustForwarded =
    process.env.TENANT_TRUST_FORWARDED_HOST === 'true' ||
    process.env.NODE_ENV !== 'production';

  const forwarded = trustForwarded ? req.get('x-marketplace-host') : undefined;
  const host = forwarded || req.get('host');

  if (!host || !String(host).trim()) {
    throw new TenantResolutionError(
      'UNKNOWN_HOST',
      'Tenant resolution requires X-Marketplace-Tenant or Host header',
    );
  }

  return resolveTenant(host);
}

module.exports = {
  normalizeHost,
  normalizeTenantId,
  resolveTenantById,
  resolveTenant,
  resolveTenantFromRequest,
};
