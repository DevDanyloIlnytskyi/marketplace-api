/**
 * Delete expired integration idempotency rows for one tenant database.
 *
 * Usage:
 *   node scripts/cleanup-integration-idempotency.js
 */
require('dotenv').config();

const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels } = require('../shared/tenant/connection');
const { cleanupExpiredIdempotencyKeys } = require('../shared/integration/idempotency');

const smokeTenant = resolveSmokeTenant();

async function main() {
  const tenant = smokeTenant.tenant;
  console.log(`[smoke] tenant=${tenant.id} domain=${smokeTenant.tenantDomain} source=${smokeTenant.source}`);

  const models = getTenantModels(tenant);
  const deleted = await cleanupExpiredIdempotencyKeys(models, {
    tenantId: tenant.id,
    before: new Date(),
  });

  console.log(`[${tenant.id}] deleted expired idempotency rows: ${deleted}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
