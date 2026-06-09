/**
 * Legacy default Sequelize export for scripts and backward compatibility.
 * Runtime API requests use per-tenant connections via shared/tenant (req.sequelize).
 */
const { resolveTenant } = require('./shared/tenant/resolve');
const { getTenantConnection } = require('./shared/tenant/connection');

const defaultTenant = resolveTenant(
  process.env.TENANT_DEV_DOMAIN || process.env.TENANT_DEV_HOST || 'localhost',
);

module.exports = getTenantConnection(defaultTenant);
