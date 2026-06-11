const {
  normalizeHost,
  normalizeTenantId,
  resolveTenantById,
  resolveTenant,
  resolveTenantFromRequest,
} = require('./resolve');
const {
  loadRegistry,
  clearRegistryCache,
  listTenants,
  findTenantByDomain,
  findTenantById,
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
  normalizeTenantId,
  resolveTenantById,
  resolveTenant,
  resolveTenantFromRequest,
  loadRegistry,
  clearRegistryCache,
  listTenants,
  findTenantByDomain,
  findTenantById,
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
