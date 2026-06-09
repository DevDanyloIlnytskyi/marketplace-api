const { TenantResolutionError } = require('./errors');
const {
  findTenantByDomain,
  findTenantByDatabase,
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
 * Resolve tenant from incoming HTTP host.
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
 * Extract marketplace host from Express request (BFF forwards X-Marketplace-Host).
 * @param {import('express').Request} req
 */
function resolveTenantFromRequest(req) {
  const trustForwarded =
    process.env.TENANT_TRUST_FORWARDED_HOST === 'true' ||
    process.env.NODE_ENV !== 'production';

  const forwarded = trustForwarded ? req.get('x-marketplace-host') : undefined;
  const host = forwarded || req.get('host');
  return resolveTenant(host);
}

module.exports = {
  normalizeHost,
  resolveTenant,
  resolveTenantFromRequest,
};
