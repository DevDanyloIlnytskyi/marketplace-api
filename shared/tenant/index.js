const { normalizeHost, resolveTenant, resolveTenantFromRequest } = require('./resolve');
const {
  loadRegistry,
  clearRegistryCache,
  listTenants,
  findTenantByDomain,
  findTenantByDatabase,
  getRegistryPath,
} = require('./registry');
const { TenantResolutionError, tenantErrorStatus } = require('./errors');
const {
  getTenantConnection,
  getTenantModels,
  attachTenantContext,
  closeAllTenantConnections,
} = require('./connection');
const tenantMiddleware = require('./middleware');

module.exports = {
  normalizeHost,
  resolveTenant,
  resolveTenantFromRequest,
  loadRegistry,
  clearRegistryCache,
  listTenants,
  findTenantByDomain,
  findTenantByDatabase,
  getRegistryPath,
  TenantResolutionError,
  tenantErrorStatus,
  getTenantConnection,
  getTenantModels,
  attachTenantContext,
  closeAllTenantConnections,
  tenantMiddleware,
};
