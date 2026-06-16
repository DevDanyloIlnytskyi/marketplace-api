/**
 * Platform-6.8 — Cleanup Recovery (discovery → dry-run → execute → verify)
 *
 * Usage:
 *   npm run platform-68-cleanup-recovery
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { stopSyncWorker } = require('../shared/integration-sync');

const MARKERS = Object.freeze({
  productPrefix: 'P68_%',
  jobClientRef: 'P68_%',
  idempotencyPrefix: 'P68-%',
  apiKeyLabel: 'Platform-6.8 reliability',
  createdBy: 'integration-sync-platform-68',
});

const FORBIDDEN_PREFIXES = Object.freeze(['p62-', 'p63-', 'p64-', 'p65-', 'LOADTEST_']);
const RESULTS_DIR = path.join(__dirname, '../../project-context/results');
const BATCH = 500;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function connectWithRetry(sequelize, attempts = 5, delayMs = 3000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await sequelize.authenticate();
      return;
    } catch (error) {
      if (i === attempts - 1) throw error;
      console.log(`DB connect attempt ${i + 1}/${attempts} failed, retry in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function cancelActiveP68Jobs(sequelize, tenantId) {
  await sequelize.query(
    `UPDATE integration_sync_jobs
     SET status = 'cancelled', finished_at = NOW(), worker_id = NULL,
         heartbeat_at = NULL, lease_expires_at = NULL
     WHERE tenant_id = :tenantId
       AND status IN ('pending', 'running', 'paused', 'uploading')
       AND client_reference LIKE 'P68_%'`,
    { replacements: { tenantId } },
  );
}

async function discover(sequelize, models) {
  const counts = {};
  const tables = [
    ['products', "id_bas LIKE 'P68_%'"],
    ['products_photos', "id_bas_product LIKE 'P68_%' OR photo LIKE '%P68_%'"],
    ['products_price', "id_bas_product LIKE 'P68_%'"],
    ['products_quantity', "id_bas_product LIKE 'P68_%'"],
    ['integration_sync_jobs', "client_reference LIKE 'P68_%'"],
    ['integration_idempotency_keys', "idempotency_key LIKE 'P68-%'"],
  ];
  for (const [table, where] of tables) {
    const [[row]] = await sequelize.query(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`);
    counts[table] = Number(row.c);
  }
  const jobs = await models.IntegrationSyncJob.findAll({
    where: { client_reference: { [Op.like]: 'P68_%' } },
    attributes: ['id'],
  });
  const jobIds = jobs.map((j) => j.id);
  counts.integration_sync_job_batches = jobIds.length
    ? await models.IntegrationSyncJobBatch.count({ where: { job_id: { [Op.in]: jobIds } } })
    : 0;
  counts.integration_sync_job_events = jobIds.length
    ? await models.IntegrationSyncJobEvent.count({ where: { job_id: { [Op.in]: jobIds } } })
    : 0;

  const apiKeys = await sequelize.query(
    `SELECT COUNT(*) AS c FROM integration_api_keys WHERE label LIKE 'Platform-6.8 reliability%'`,
    { type: sequelize.QueryTypes.SELECT },
  ).catch(() => [{ c: 0 }]);

  counts.integration_api_keys = Number(apiKeys[0]?.c || 0);
  return counts;
}

async function executeCleanup(sequelize, models, tenantId) {
  stopSyncWorker();
  await cancelActiveP68Jobs(sequelize, tenantId);

  const jobs = await models.IntegrationSyncJob.findAll({
    where: { client_reference: { [Op.like]: 'P68_%' } },
    attributes: ['id'],
  });
  const jobIds = jobs.map((j) => j.id);
  if (jobIds.length) {
    await models.IntegrationSyncJobEvent.destroy({ where: { job_id: { [Op.in]: jobIds } } });
    await models.IntegrationSyncJobBatch.destroy({ where: { job_id: { [Op.in]: jobIds } } });
    await models.IntegrationSyncJob.destroy({ where: { id: { [Op.in]: jobIds } } });
  }

  await sequelize.query(`DELETE FROM integration_idempotency_keys WHERE idempotency_key LIKE 'P68-%'`);
  await sequelize.query(`DELETE FROM products_photos WHERE id_bas_product LIKE 'P68_%' OR photo LIKE '%P68_%'`);
  await sequelize.query(`DELETE FROM products_quantity WHERE id_bas_product LIKE 'P68_%'`);
  await sequelize.query(`DELETE FROM products_price WHERE id_bas_product LIKE 'P68_%'`);

  let deleted = 0;
  while (true) {
    const [rows] = await sequelize.query(
      `SELECT id_bas FROM products WHERE id_bas LIKE 'P68_%' LIMIT ${BATCH}`,
    );
    if (!rows.length) break;
    const ids = rows.map((r) => sequelize.escape(r.id_bas)).join(',');
    await sequelize.query(`DELETE FROM products WHERE id_bas IN (${ids})`);
    deleted += rows.length;
  }

  await sequelize.query(
    `DELETE FROM integration_api_keys WHERE label LIKE 'Platform-6.8 reliability%'`,
  ).catch(() => {});

  return { productsDeleted: deleted };
}

async function verify(sequelize) {
  const remaining = await discover(sequelize, getTenantModels(findTenantById(process.env.SMOKE_TENANT_ID || 'demo')));
  const total = Object.values(remaining).reduce((a, b) => a + b, 0);
  return { remaining, pass: total === 0 };
}

async function validateIntegrity(sequelize, beforeCounts) {
  const after = {};
  for (const prefix of FORBIDDEN_PREFIXES) {
    const [[{ c }]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM products WHERE id_bas LIKE :p`,
      { replacements: { p: `${prefix}%` } },
    );
    after[prefix] = Number(c);
  }
  let nonP68Removed = false;
  for (const prefix of FORBIDDEN_PREFIXES) {
    const before = beforeCounts[prefix] ?? after[prefix];
    if (after[prefix] < before) nonP68Removed = true;
  }
  return { pass: !nonP68Removed, after, nonP68Removed };
}

async function main() {
  console.log('\n=== Platform-6.8 Cleanup Recovery ===\n');
  const tenant = findTenantById(process.env.SMOKE_TENANT_ID || 'demo');
  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);
  await connectWithRetry(sequelize);

  const forbiddenBefore = {};
  for (const prefix of FORBIDDEN_PREFIXES) {
    const [[{ c }]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM products WHERE id_bas LIKE :p`,
      { replacements: { p: `${prefix}%` } },
    );
    forbiddenBefore[prefix] = Number(c);
  }

  console.log('--- Discovery ---');
  const candidates = await discover(sequelize, models);
  console.log(JSON.stringify(candidates, null, 2));

  ensureDir(RESULTS_DIR);
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'PLATFORM_6_8_CLEANUP_DRYRUN.md'),
    `# Platform-6.8 Cleanup Dry Run\n\n${JSON.stringify(candidates, null, 2)}\n`,
  );

  console.log('\n--- Execute ---');
  const execution = await executeCleanup(sequelize, models, tenant.id);
  console.log(JSON.stringify(execution, null, 2));

  console.log('\n--- Verification ---');
  const verification = await verify(sequelize);
  console.log(JSON.stringify(verification, null, 2));

  const integrity = await validateIntegrity(sequelize, forbiddenBefore);
  console.log('\n--- Integrity ---');
  console.log(JSON.stringify(integrity, null, 2));

  const status = verification.pass && integrity.pass
    ? 'NO_PLATFORM_6_8_TEST_DATA_REMAINING'
    : 'BLOCKERS';

  const report = {
    candidates,
    execution,
    verification,
    integrity,
    status,
  };
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'PLATFORM_6_8_CLEANUP_REPORT.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(`\n${status}\n`);
  if (status === 'BLOCKERS') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
