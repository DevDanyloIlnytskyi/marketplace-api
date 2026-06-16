/**
 * Resolve tenant for integration smoke / validation scripts.
 *
 * Priority:
 * 1. SMOKE_TENANT_ID + SMOKE_TENANT_DOMAIN (both must match registry)
 * 2. SMOKE_TENANT_ID only → domain from registry
 * 3. SMOKE_TENANT_DOMAIN only → id from registry
 * 4. First active tenant in tenant registry (clients.json order)
 */
const {
  findTenantById,
  findTenantByDomain,
  listTenants,
} = require('../../shared/tenant/registry');

/**
 * @returns {import('../../shared/tenant/config').TenantConfig}
 */
function getFirstActiveTenant() {
  const active = listTenants().filter((tenant) => tenant.active !== false);
  if (active.length === 0) {
    throw new Error('No active tenants found in tenant registry');
  }
  return active[0];
}

/**
 * @returns {{
 *   tenant: import('../../shared/tenant/config').TenantConfig,
 *   tenantId: string,
 *   tenantDomain: string,
 *   source: 'env' | 'env-id' | 'env-domain' | 'registry-default',
 * }}
 */
function resolveSmokeTenant() {
  const envId = process.env.SMOKE_TENANT_ID?.trim();
  const envDomain = process.env.SMOKE_TENANT_DOMAIN?.trim();

  if (envId && envDomain) {
    const tenant = findTenantById(envId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${envId}`);
    }
    if (tenant.domain.toLowerCase() !== envDomain.toLowerCase()) {
      throw new Error(
        `SMOKE_TENANT_DOMAIN mismatch for ${envId}: env=${envDomain} registry=${tenant.domain}`,
      );
    }
    if (!tenant.active) {
      throw new Error(`Tenant "${tenant.id}" is inactive`);
    }
    return {
      tenant,
      tenantId: tenant.id,
      tenantDomain: tenant.domain,
      source: 'env',
    };
  }

  if (envId) {
    const tenant = findTenantById(envId);
    if (!tenant) {
      throw new Error(`Tenant not found: ${envId}`);
    }
    if (!tenant.active) {
      throw new Error(`Tenant "${tenant.id}" is inactive`);
    }
    return {
      tenant,
      tenantId: tenant.id,
      tenantDomain: tenant.domain,
      source: 'env-id',
    };
  }

  if (envDomain) {
    const tenant = findTenantByDomain(envDomain.toLowerCase());
    if (!tenant) {
      throw new Error(`Tenant not found for domain: ${envDomain}`);
    }
    if (!tenant.active) {
      throw new Error(`Tenant "${tenant.id}" is inactive`);
    }
    return {
      tenant,
      tenantId: tenant.id,
      tenantDomain: tenant.domain,
      source: 'env-domain',
    };
  }

  const tenant = getFirstActiveTenant();
  return {
    tenant,
    tenantId: tenant.id,
    tenantDomain: tenant.domain,
    source: 'registry-default',
  };
}

module.exports = {
  resolveSmokeTenant,
  getFirstActiveTenant,
};
