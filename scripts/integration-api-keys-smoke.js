/**
 * Manual smoke test for Platform-4.5.1 integration API key foundation.
 * Does not start HTTP server or touch legacy auth.
 *
 * Usage (after migration on test_bd):
 *   node scripts/integration-api-keys-smoke.js
 */
require('dotenv').config();

const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels } = require('../shared/tenant/connection');
const {
  createKey,
  findByHash,
  findById,
  listActiveKeys,
  revokeKey,
  markUsed,
  rotateKey,
  completeRotation,
  hashIntegrationApiKey,
  isActive,
  validateTenantBinding,
} = require('../shared/integration/keys');

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';

async function main() {
  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);

  const { plaintext, record } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-4.5.1 smoke test',
    scopes: ['prices.read', 'prices.write'],
    createdBy: 'integration-api-keys-smoke',
  });

  console.log('created key id:', record.id);
  console.log('plaintext (show once):', plaintext);

  const byHash = await findByHash(models, hashIntegrationApiKey(plaintext));
  console.log('findByHash ok:', byHash?.id === record.id);

  const binding = validateTenantBinding(byHash, tenant, plaintext);
  console.log('validateTenantBinding:', binding);

  console.log('isActive:', isActive(byHash));

  await markUsed(models, record.id, { force: true });
  const activeKeys = await listActiveKeys(models, tenant.id);
  console.log('listActiveKeys count:', activeKeys.length);

  const rotation = await rotateKey(models, record.id, {
    createdBy: 'integration-api-keys-smoke',
  });
  console.log('rotateKey new id:', rotation.newKey.id);

  await completeRotation(models, record.id, rotation.newKey.id);
  await revokeKey(models, rotation.newKey.id, 'smoke cleanup');

  console.log('smoke test completed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
