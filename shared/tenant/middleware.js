const { TenantResolutionError, tenantErrorStatus } = require('./errors');
const { resolveTenantFromRequest } = require('./resolve');
const { attachTenantContext } = require('./connection');

/**
 * Resolve tenant from Host / X-Marketplace-Host and attach req.tenant, req.sequelize, req.models.
 */
function tenantMiddleware(req, res, next) {
  try {
    const tenant = resolveTenantFromRequest(req);
    attachTenantContext(req, tenant);
    res.setHeader('X-Marketplace-Tenant', tenant.id);
    res.setHeader('X-Marketplace-Domain', tenant.domain);
    next();
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      return res.status(tenantErrorStatus(error)).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return res.status(400).json({
      success: false,
      code: 'INVALID_TENANT',
      message: error instanceof Error ? error.message : 'Unknown tenant',
    });
  }
}

module.exports = tenantMiddleware;
