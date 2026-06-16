/**
 * Delete expired integration idempotency rows for one tenant database.
 *
 * Usage:
 *   node scripts/cleanup-integration-idempotency.js
 */
require('dotenv').config();

const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels } = require('../shared/tenant/connection');
const { cleanupExpiredIdempotencyKeys } = require('../shared/integration/idempotency');

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';

async function main() {
  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

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
