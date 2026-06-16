/**
 * Emergency cleanup for LOADTEST_ data in test_bd.
 * Usage: node scripts/cleanup-loadtest.js
 */
require('dotenv').config();

const { findTenantById } = require('../shared/tenant/registry');
const { getTenantConnection } = require('../shared/tenant/connection');
const { stopSyncWorker } = require('../shared/integration-sync');

const BATCH = 500;

async function main() {
  stopSyncWorker();
  const tenant = findTenantById(process.env.SMOKE_TENANT_ID || 'demo');
  const sequelize = getTenantConnection(tenant);
  await sequelize.authenticate();

  await sequelize.query(
    `UPDATE integration_sync_jobs
     SET status = 'cancelled', finished_at = NOW(), worker_id = NULL,
         heartbeat_at = NULL, lease_expires_at = NULL
     WHERE tenant_id = :tenantId
       AND status IN ('pending', 'running', 'paused', 'uploading')`,
    { replacements: { tenantId: tenant.id } },
  );

  await sequelize.query(`DELETE FROM integration_sync_job_events WHERE job_id IN (
    SELECT id FROM integration_sync_jobs WHERE client_reference LIKE 'LOADTEST_%'
  )`);
  await sequelize.query(`DELETE FROM integration_sync_job_batches WHERE job_id IN (
    SELECT id FROM integration_sync_jobs WHERE client_reference LIKE 'LOADTEST_%'
  )`);
  await sequelize.query(`DELETE FROM integration_sync_jobs WHERE client_reference LIKE 'LOADTEST_%'`);

  for (const table of [
    'products_photos',
    'products_quantity',
    'products_price',
    'products',
  ]) {
    let total = 0;
    for (;;) {
      const [result] = await sequelize.query(
        table === 'products_photos'
          ? `DELETE FROM products_photos WHERE id_bas_product LIKE 'LOADTEST_%' OR photo LIKE '%LOADTEST_%' LIMIT ${BATCH}`
          : table === 'products'
            ? `DELETE FROM products WHERE id_bas LIKE 'LOADTEST_%' LIMIT ${BATCH}`
            : `DELETE FROM ${table} WHERE id_bas_product LIKE 'LOADTEST_%' LIMIT ${BATCH}`,
      );
      const affected = result.affectedRows || 0;
      total += affected;
      if (affected === 0) {
        break;
      }
      process.stdout.write(`\r${table}: ${total}`);
    }
    console.log(`\n${table}: done (${total})`);
  }

  const [[{ remaining }]] = await sequelize.query(
    `SELECT COUNT(*) AS remaining FROM products WHERE id_bas LIKE 'LOADTEST_%'`,
  );
  const [[{ total }]] = await sequelize.query(`SELECT COUNT(*) AS total FROM products`);
  console.log({ remaining, total });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
