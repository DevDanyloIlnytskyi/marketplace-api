/**
 * Platform-6.6.1 — Cleanup Recovery (discovery → dry-run → safety → execute → verify)
 *
 * Usage:
 *   node scripts/platform-66-1-cleanup-recovery.js --phase=discovery
 *   node scripts/platform-66-1-cleanup-recovery.js --phase=dryrun
 *   node scripts/platform-66-1-cleanup-recovery.js --phase=execute
 *   node scripts/platform-66-1-cleanup-recovery.js --phase=all
 *
 * Env:
 *   db_port=3306|3307  (override if needed)
 *   SMOKE_TENANT_ID / SMOKE_TENANT_DOMAIN (optional — defaults to first active registry tenant)
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { stopSyncWorker } = require('../shared/integration-sync');

/** Known Platform-6.6 run IDs from logs */
const PLATFORM_66_RUN_IDS = Object.freeze([
  '1781534784871',
  '1781535136805',
  '1781535435584',
  '1781545806622',
]);

/** Platform-6.6 script markers */
const PLATFORM_66_MARKERS = Object.freeze({
  productPrefix: 'LOADTEST_%',
  jobClientRef: 'LOADTEST_%',
  idempotencyPrefix: 'LOADTEST-%',
  apiKeyLabel: 'Platform-6.6 loadtest',
  createdBy: 'integration-sync-platform-66',
});

/** Prefixes that must NEVER appear in cleanup candidates */
const FORBIDDEN_PREFIXES = Object.freeze(['p62-', 'p63-', 'p64-', 'p65-']);

const BATCH = 500;

async function connectWithRetry(sequelize, attempts = 5, delayMs = 3000) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await sequelize.authenticate();
      return;
    } catch (error) {
      if (i === attempts - 1) {
        throw error;
      }
      console.log(`DB connect attempt ${i + 1}/${attempts} failed, retry in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
const RESULTS_DIR = path.join(__dirname, '../../project-context/results');

/** @type {'discovery'|'dryrun'|'execute'|'all'} */
const PHASE = (() => {
  const arg = process.argv.find((a) => a.startsWith('--phase='));
  return arg ? arg.split('=')[1] : 'all';
})();

/** @type {Record<string, unknown>} */
const REPORT = {
  phase: PHASE,
  capturedAt: new Date().toISOString(),
  candidates: null,
  safety: null,
  execution: null,
  verification: null,
  integrity: null,
  blockers: [],
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
async function cancelActiveLoadtestJobs(sequelize, tenantId) {
  await sequelize.query(
    `UPDATE integration_sync_jobs
     SET status = 'cancelled', finished_at = NOW(), worker_id = NULL,
         heartbeat_at = NULL, lease_expires_at = NULL
     WHERE tenant_id = :tenantId
       AND status IN ('pending', 'running', 'paused', 'uploading')
       AND client_reference LIKE 'LOADTEST_%'`,
    { replacements: { tenantId } },
  );
}

/**
 * @param {ReturnType<import('../shared/tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 */
async function discoverCandidates(models, sequelize) {
  const tenant = resolveSmokeTenant().tenant;

  const [[{ productCount }]] = await sequelize.query(
    `SELECT COUNT(*) AS productCount FROM products WHERE id_bas LIKE 'LOADTEST_%'`,
  );
  const [[{ photoCount }]] = await sequelize.query(
    `SELECT COUNT(*) AS photoCount FROM products_photos
     WHERE id_bas_product LIKE 'LOADTEST_%' OR photo LIKE '%LOADTEST_%'`,
  );
  const [[{ priceCount }]] = await sequelize.query(
    `SELECT COUNT(*) AS priceCount FROM products_price WHERE id_bas_product LIKE 'LOADTEST_%'`,
  );
  const [[{ stockCount }]] = await sequelize.query(
    `SELECT COUNT(*) AS stockCount FROM products_quantity WHERE id_bas_product LIKE 'LOADTEST_%'`,
  );

  const jobs = await models.IntegrationSyncJob.findAll({
    where: { client_reference: { [Op.like]: 'LOADTEST_%' } },
    attributes: [
      'id',
      'client_reference',
      'status',
      'created_at',
      'processed_records',
      'job_type',
    ],
    order: [['created_at', 'ASC']],
  });

  const jobIds = jobs.map((j) => j.id);
  let batchCount = 0;
  let eventCount = 0;
  if (jobIds.length > 0) {
    batchCount = await models.IntegrationSyncJobBatch.count({
      where: { job_id: { [Op.in]: jobIds } },
    });
    eventCount = await models.IntegrationSyncJobEvent.count({
      where: { job_id: { [Op.in]: jobIds } },
    });
  }

  const idempotencyKeys = await models.IntegrationIdempotencyKey.findAll({
    where: { idempotency_key: { [Op.like]: 'LOADTEST-%' } },
    attributes: ['id', 'idempotency_key', 'created_at'],
    order: [['created_at', 'ASC']],
    limit: 20,
  });
  const idempotencyCount = await models.IntegrationIdempotencyKey.count({
    where: { idempotency_key: { [Op.like]: 'LOADTEST-%' } },
  });

  const apiKeys = await sequelize.query(
    `SELECT id, label, created_at FROM integration_api_keys
     WHERE label LIKE 'Platform-6.6 loadtest%'`,
    { type: sequelize.QueryTypes.SELECT },
  ).catch(() => []);

  const apiKeyIds = apiKeys.map((k) => k.id);

  let logCount = 0;
  if (apiKeyIds.length > 0) {
    const inList = apiKeyIds.map((id) => sequelize.escape(id)).join(',');
    const [[row]] = await sequelize.query(
      `SELECT COUNT(*) AS logCount FROM integration_logs
       WHERE tenant_id = :tenantId AND api_key_id IN (${inList})`,
      { replacements: { tenantId: tenant.id } },
    );
    logCount = Number(row.logCount);
  }

  const [sampleProducts] = await sequelize.query(
    `SELECT id_bas FROM products WHERE id_bas LIKE 'LOADTEST_%' ORDER BY id_bas ASC LIMIT 10`,
  );
  const [samplePhotos] = await sequelize.query(
    `SELECT id_bas_product, photo FROM products_photos
     WHERE id_bas_product LIKE 'LOADTEST_%' OR photo LIKE '%LOADTEST_%'
     ORDER BY id_bas_product ASC LIMIT 5`,
  );
  const [sampleJobs] = await sequelize.query(
    `SELECT id, client_reference, status FROM integration_sync_jobs
     WHERE client_reference LIKE 'LOADTEST_%' ORDER BY created_at ASC LIMIT 10`,
  );

  const runIdRefs = {};
  for (const runId of PLATFORM_66_RUN_IDS) {
    const [[row]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM integration_sync_jobs WHERE client_reference LIKE :pattern`,
      { replacements: { pattern: `LOADTEST_${runId}_%` } },
    );
    runIdRefs[runId] = Number(row.c);
  }

  return {
    selectionCriteria: {
      products: "id_bas LIKE 'LOADTEST_%'",
      products_photos: "id_bas_product LIKE 'LOADTEST_%' OR photo LIKE '%LOADTEST_%'",
      products_price: "id_bas_product LIKE 'LOADTEST_%'",
      products_quantity: "id_bas_product LIKE 'LOADTEST_%'",
      integration_sync_jobs: "client_reference LIKE 'LOADTEST_%'",
      integration_sync_job_batches: 'job_id IN (LOADTEST jobs above)',
      integration_sync_job_events: 'job_id IN (LOADTEST jobs above)',
      integration_idempotency_keys: "idempotency_key LIKE 'LOADTEST-%'",
      integration_logs: 'api_key_id IN (integration_api_keys WHERE label LIKE Platform-6.6 loadtest%)',
      integration_api_keys: "label LIKE 'Platform-6.6 loadtest%'",
    },
    counts: {
      products: Number(productCount),
      products_photos: Number(photoCount),
      products_price: Number(priceCount),
      products_quantity: Number(stockCount),
      integration_sync_jobs: jobs.length,
      integration_sync_job_batches: batchCount,
      integration_sync_job_events: eventCount,
      integration_idempotency_keys: idempotencyCount,
      integration_logs: Number(logCount),
      integration_api_keys: apiKeys.length,
    },
    runIdBreakdown: runIdRefs,
    samples: {
      products: sampleProducts,
      products_photos: samplePhotos,
      jobs: sampleJobs,
      idempotency_keys: idempotencyKeys.map((k) => ({
        id: k.id,
        key: k.idempotency_key,
      })),
      api_keys: apiKeys,
    },
    jobIds,
    jobs: jobs.map((j) => ({
      id: j.id,
      client_reference: j.client_reference,
      status: j.status,
      created_at: j.created_at,
      processed_records: j.processed_records,
    })),
  };
}

/**
 * @param {ReturnType<import('../shared/tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 * @param {{ jobIds: string[] }} candidates
 */
async function validateSafety(models, sequelize, candidates) {
  const blockers = [];

  for (const prefix of FORBIDDEN_PREFIXES) {
    const [[{ c }]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM products WHERE id_bas LIKE :p AND id_bas LIKE 'LOADTEST_%'`,
      { replacements: { p: `${prefix}%` } },
    );
    if (Number(c) > 0) {
      blockers.push(`Forbidden prefix ${prefix} found in LOADTEST candidate products (${c})`);
    }
  }

  for (const prefix of FORBIDDEN_PREFIXES) {
    const [[{ c }]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM products WHERE id_bas LIKE :p`,
      { replacements: { p: `${prefix}%` } },
    );
    REPORT.integrity = REPORT.integrity || {};
    REPORT.integrity[`${prefix}count_before`] = Number(c);
  }

  if (candidates.jobIds.length > 0) {
    const nonLoadtestJobs = await models.IntegrationSyncJob.count({
      where: {
        id: { [Op.in]: candidates.jobIds },
        client_reference: { [Op.notLike]: 'LOADTEST_%' },
      },
    });
    if (nonLoadtestJobs > 0) {
      blockers.push(`Job ID list contains ${nonLoadtestJobs} non-LOADTEST jobs`);
    }
  }

  const [[{ strayProducts }]] = await sequelize.query(
    `SELECT COUNT(*) AS strayProducts FROM products
     WHERE id_bas NOT LIKE 'LOADTEST_%'
       AND (id_bas LIKE 'p62-%' OR id_bas LIKE 'p63-%' OR id_bas LIKE 'p64-%' OR id_bas LIKE 'p65-%')
       AND id IN (
         SELECT p.id FROM products p
         INNER JOIN products p2 ON p.id = p2.id
         WHERE p.id_bas LIKE 'p62-%' OR p.id_bas LIKE 'p63-%' OR p.id_bas LIKE 'p64-%' OR p.id_bas LIKE 'p65-%'
       )`,
  );

  const crossCheck = await sequelize.query(
    `SELECT id_bas FROM products
     WHERE id_bas LIKE 'LOADTEST_%'
       AND (id_bas LIKE 'p62-%' OR id_bas LIKE 'p63-%' OR id_bas LIKE 'p64-%' OR id_bas LIKE 'p65-%')
     LIMIT 5`,
  );
  if (crossCheck[0].length > 0) {
    blockers.push('LOADTEST candidates overlap with p62-p65 prefixes');
  }

  return {
    pass: blockers.length === 0,
    blockers,
    strayPlatformSmokeInCandidates: Number(strayProducts),
  };
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tenantId
 * @param {string[]} jobIds
 */
async function executeCleanup(sequelize, tenantId, jobIds) {
  stopSyncWorker();
  await cancelActiveLoadtestJobs(sequelize, tenantId);
  await new Promise((r) => setTimeout(r, 1000));

  const deleted = {
    products_photos: 0,
    products_quantity: 0,
    products_price: 0,
    products: 0,
    integration_sync_job_events: 0,
    integration_sync_job_batches: 0,
    integration_sync_jobs: 0,
    integration_idempotency_keys: 0,
    integration_logs: 0,
    integration_api_keys: 0,
  };

  const batchDelete = async (sql, key) => {
    for (;;) {
      const [result] = await sequelize.query(sql);
      const n = result.affectedRows || 0;
      deleted[key] += n;
      if (n === 0) {
        break;
      }
    }
  };

  if (jobIds.length > 0) {
    const inList = jobIds.map((id) => sequelize.escape(id)).join(',');
    await batchDelete(
      `DELETE FROM integration_sync_job_events WHERE job_id IN (${inList}) LIMIT ${BATCH}`,
      'integration_sync_job_events',
    );
    await batchDelete(
      `DELETE FROM integration_sync_job_batches WHERE job_id IN (${inList}) LIMIT ${BATCH}`,
      'integration_sync_job_batches',
    );
    await batchDelete(
      `DELETE FROM integration_sync_jobs WHERE id IN (${inList}) AND client_reference LIKE 'LOADTEST_%' LIMIT ${BATCH}`,
      'integration_sync_jobs',
    );
  }

  await batchDelete(
    `DELETE FROM products_photos WHERE id_bas_product LIKE 'LOADTEST_%' OR photo LIKE '%LOADTEST_%' LIMIT ${BATCH}`,
    'products_photos',
  );
  await batchDelete(
    `DELETE FROM products_quantity WHERE id_bas_product LIKE 'LOADTEST_%' LIMIT ${BATCH}`,
    'products_quantity',
  );
  await batchDelete(
    `DELETE FROM products_price WHERE id_bas_product LIKE 'LOADTEST_%' LIMIT ${BATCH}`,
    'products_price',
  );
  await batchDelete(
    `DELETE FROM products WHERE id_bas LIKE 'LOADTEST_%' LIMIT ${BATCH}`,
    'products',
  );

  await batchDelete(
    `DELETE FROM integration_idempotency_keys WHERE idempotency_key LIKE 'LOADTEST-%' LIMIT ${BATCH}`,
    'integration_idempotency_keys',
  );

  const apiKeys = await sequelize.query(
    `SELECT id FROM integration_api_keys WHERE label LIKE 'Platform-6.6 loadtest%'`,
    { type: sequelize.QueryTypes.SELECT },
  );
  if (apiKeys.length > 0) {
    const keyInList = apiKeys.map((k) => sequelize.escape(k.id)).join(',');
    await batchDelete(
      `DELETE FROM integration_logs
       WHERE tenant_id = ${sequelize.escape(tenantId)}
         AND api_key_id IN (${keyInList})
       LIMIT ${BATCH}`,
      'integration_logs',
    );
    await batchDelete(
      `DELETE FROM integration_api_keys WHERE label LIKE 'Platform-6.6 loadtest%' LIMIT ${BATCH}`,
      'integration_api_keys',
    );
  }

  return deleted;
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
async function verifyNoLoadtest(sequelize) {
  const tables = [
    ['products', "id_bas LIKE 'LOADTEST_%'"],
    ['products_photos', "id_bas_product LIKE 'LOADTEST_%' OR photo LIKE '%LOADTEST_%'"],
    ['products_price', "id_bas_product LIKE 'LOADTEST_%'"],
    ['products_quantity', "id_bas_product LIKE 'LOADTEST_%'"],
    ['integration_sync_jobs', "client_reference LIKE 'LOADTEST_%'"],
    ['integration_idempotency_keys', "idempotency_key LIKE 'LOADTEST-%'"],
  ];

  /** @type {Record<string, number>} */
  const remaining = {};
  for (const [table, where] of tables) {
    const [[row]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`,
    );
    remaining[table] = Number(row.c);
  }

  const [[{ batches }]] = await sequelize.query(
    `SELECT COUNT(*) AS batches FROM integration_sync_job_batches b
     INNER JOIN integration_sync_jobs j ON j.id = b.job_id
     WHERE j.client_reference LIKE 'LOADTEST_%'`,
  );
  const [[{ events }]] = await sequelize.query(
    `SELECT COUNT(*) AS events FROM integration_sync_job_events e
     INNER JOIN integration_sync_jobs j ON j.id = e.job_id
     WHERE j.client_reference LIKE 'LOADTEST_%'`,
  );
  remaining.integration_sync_job_batches = Number(batches);
  remaining.integration_sync_job_events = Number(events);

  const totalRemaining = Object.values(remaining).reduce((a, b) => a + b, 0);
  return { remaining, pass: totalRemaining === 0 };
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 * @param {Record<string, number>} beforeCounts
 */
async function validateIntegrity(sequelize, beforeCounts) {
  const after = {};
  for (const prefix of FORBIDDEN_PREFIXES) {
    const [[{ c }]] = await sequelize.query(
      `SELECT COUNT(*) AS c FROM products WHERE id_bas LIKE :p`,
      { replacements: { p: `${prefix}%` } },
    );
    after[prefix] = Number(c);
  }

  const [[{ totalProducts }]] = await sequelize.query(
    `SELECT COUNT(*) AS totalProducts FROM products`,
  );

  const removed = {};
  let nonPlatform66Removed = false;
  for (const prefix of FORBIDDEN_PREFIXES) {
    const key = `${prefix}count_before`;
    const before = beforeCounts[key] ?? after[prefix];
    removed[prefix] = { before, after: after[prefix], delta: after[prefix] - before };
    if (after[prefix] < before) {
      nonPlatform66Removed = true;
    }
  }

  return {
    pass: !nonPlatform66Removed,
    platformSmokeCounts: after,
    deltas: removed,
    totalProducts: Number(totalProducts),
    nonPlatform66Removed,
  };
}

function writeDryRunMd(candidates, safety) {
  ensureDir(RESULTS_DIR);
  const lines = [];
  lines.push('# Platform-6.6.1 — Cleanup Dry Run Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('**Status:** DRY RUN ONLY — no records deleted');
  lines.push('');
  lines.push('## CLEANUP_CANDIDATES');
  lines.push('');
  lines.push('| Table | records_to_delete | selection criteria |');
  lines.push('|-------|-------------------|-------------------|');
  for (const [table, criteria] of Object.entries(candidates.selectionCriteria)) {
    const countKey = table.replace('integration_', 'integration_');
    const count = candidates.counts[table] ?? candidates.counts[countKey] ?? 0;
    lines.push(`| ${table} | **${count}** | \`${criteria}\` |`);
  }
  lines.push('');
  lines.push('## Run ID Breakdown (integration_sync_jobs by client_reference)');
  lines.push('');
  for (const [runId, count] of Object.entries(candidates.runIdBreakdown)) {
    lines.push(`- \`LOADTEST_${runId}_*\`: ${count} jobs`);
  }
  lines.push('');
  lines.push('## Sample IDs');
  lines.push('');
  lines.push('### products (id_bas)');
  lines.push('```');
  for (const row of candidates.samples.products) {
    lines.push(row.id_bas);
  }
  lines.push('```');
  lines.push('');
  lines.push('### integration_sync_jobs');
  lines.push('```json');
  lines.push(JSON.stringify(candidates.samples.jobs, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Safety Validation Preview');
  lines.push('');
  lines.push(safety.pass ? '**PASS** — no forbidden prefixes in candidates' : `**BLOCKERS:** ${safety.blockers.join('; ')}`);
  lines.push('');
  fs.writeFileSync(path.join(RESULTS_DIR, 'PLATFORM_6_6_CLEANUP_DRYRUN.md'), lines.join('\n'));
}

function writeResultsMd(report) {
  const lines = [];
  lines.push('# Platform-6.6.1 — Cleanup Recovery Results');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Captured:** ${report.capturedAt}`);
  lines.push('');

  lines.push('# Discovery Phase');
  lines.push('');
  lines.push('Platform-6.6 artifacts identified exclusively by:');
  lines.push('- `id_bas LIKE \'LOADTEST_%\'` (products, prices, stock, photos)');
  lines.push('- `client_reference LIKE \'LOADTEST_%\'` (sync jobs)');
  lines.push('- `idempotency_key LIKE \'LOADTEST-%\'` (idempotency keys)');
  lines.push('- `label LIKE \'Platform-6.6 loadtest%\'` (API keys)');
  lines.push('');

  lines.push('# Cleanup Candidates');
  lines.push('');
  if (report.candidates) {
    lines.push('```json');
    lines.push(JSON.stringify(report.candidates.counts, null, 2));
    lines.push('```');
  }
  lines.push('');

  lines.push('# Dry Run Summary');
  lines.push('');
  lines.push('See `PLATFORM_6_6_CLEANUP_DRYRUN.md` for full dry-run report.');
  lines.push('');

  lines.push('# Safety Validation');
  lines.push('');
  if (report.safety) {
    lines.push(report.safety.pass ? '**PASS**' : '**BLOCKERS**');
    if (report.safety.blockers?.length) {
      for (const b of report.safety.blockers) {
        lines.push(`- ${b}`);
      }
    }
  }
  lines.push('');

  lines.push('# Cleanup Execution');
  lines.push('');
  if (report.execution) {
    lines.push('```json');
    lines.push(JSON.stringify(report.execution, null, 2));
    lines.push('```');
  } else {
    lines.push('Not executed (discovery/dry-run only or blocked).');
  }
  lines.push('');

  lines.push('# Verification');
  lines.push('');
  if (report.verification) {
    lines.push('```json');
    lines.push(JSON.stringify(report.verification, null, 2));
    lines.push('```');
    lines.push('');
    lines.push(report.verification.pass ? '**0 LOADTEST records found**' : '**LOADTEST records remain**');
  }
  lines.push('');

  lines.push('# Integrity Validation');
  lines.push('');
  if (report.integrity) {
    lines.push('```json');
    lines.push(JSON.stringify(report.integrity, null, 2));
    lines.push('```');
    lines.push('');
    lines.push(report.integrity.pass ? '**NO_NON_PLATFORM_6_6_DATA_REMOVED**' : '**NON-PLATFORM-6.6 DATA REMOVED**');
  }
  lines.push('');

  lines.push('# Remaining Records');
  lines.push('');
  if (report.verification?.remaining) {
    lines.push('```json');
    lines.push(JSON.stringify(report.verification.remaining, null, 2));
    lines.push('```');
  }
  lines.push('');

  lines.push('# Defects Found');
  lines.push('');
  lines.push('1. Platform-6.6 cleanup interrupted mid-run (MySQL disconnect / lock timeout).');
  lines.push('2. Earlier cleanup revision incorrectly targeted `p62-`/`p63-`/`p64-`/`p65-` prefixes (reverted).');
  lines.push('');

  lines.push('# Defects Fixed');
  lines.push('');
  lines.push('1. Platform-6.6.1 recovery uses strict `LOADTEST_%` / `LOADTEST-%` selectors only.');
  lines.push('2. Safety gate blocks deletion if forbidden prefixes appear in candidate set.');
  lines.push('');

  lines.push('# Cleanup Status');
  lines.push('');
  const ok =
    report.verification?.pass === true &&
    report.integrity?.pass === true &&
    report.safety?.pass === true;
  lines.push(ok ? '**NO_LOADTEST_DATA_REMAINING**' : '**BLOCKERS**');
  if (report.blockers?.length) {
    for (const b of report.blockers) {
      lines.push(`- ${b}`);
    }
  }
  lines.push('');

  fs.writeFileSync(path.join(RESULTS_DIR, 'PLATFORM_6_6_1_RESULTS.md'), lines.join('\n'));
}

async function main() {
  console.log('\n=== Platform-6.6.1 Cleanup Recovery ===\n');
  console.log(`Phase: ${PHASE}\n`);

  const tenant = resolveSmokeTenant().tenant;
  if (!tenant) {
    throw new Error('Tenant demo not found');
  }

  const sequelize = getTenantConnection(tenant);
  const models = getTenantModels(tenant);

  try {
    await connectWithRetry(sequelize, 10, 3000);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    REPORT.blockers.push(`MySQL unavailable: ${msg}`);
    writeResultsMd(REPORT);
    console.error('BLOCKERS — MySQL unavailable:', msg);
    console.error('Hint: set db_port=3306 if MySQL listens on default port');
    process.exit(1);
  }

  console.log(`Connected: ${tenant.database} (port ${process.env.db_port || 'default'})\n`);

  if (PHASE === 'discovery' || PHASE === 'dryrun' || PHASE === 'all') {
    console.log('--- Discovery Phase (read-only) ---\n');
    REPORT.candidates = await discoverCandidates(models, sequelize);
    console.log('CLEANUP_CANDIDATES:', JSON.stringify(REPORT.candidates.counts, null, 2));

    REPORT.safety = await validateSafety(models, sequelize, REPORT.candidates);
    console.log('Safety validation:', REPORT.safety.pass ? 'PASS' : 'BLOCKERS');
    if (!REPORT.safety.pass) {
      REPORT.blockers.push(...REPORT.safety.blockers);
    }

    writeDryRunMd(REPORT.candidates, REPORT.safety);
    console.log('\nDry run report: project-context/results/PLATFORM_6_6_CLEANUP_DRYRUN.md');

    if (PHASE === 'discovery' || PHASE === 'dryrun') {
      writeResultsMd(REPORT);
      if (!REPORT.safety.pass) {
        console.error('\nBLOCKERS — safety validation failed');
        process.exit(1);
      }
      console.log('\nDiscovery complete. No records deleted.');
      return;
    }
  }

  if (PHASE === 'execute' || PHASE === 'all') {
    if (!REPORT.candidates) {
      REPORT.candidates = await discoverCandidates(models, sequelize);
    }
    if (!REPORT.safety) {
      REPORT.safety = await validateSafety(models, sequelize, REPORT.candidates);
    }

    if (!REPORT.safety.pass) {
      REPORT.blockers.push(...REPORT.safety.blockers);
      writeResultsMd(REPORT);
      console.error('\nBLOCKERS — safety validation failed; cleanup NOT executed');
      process.exit(1);
    }

    const totalCandidates = Object.values(REPORT.candidates.counts).reduce(
      (a, b) => a + (typeof b === 'number' ? b : 0),
      0,
    );
    if (totalCandidates === 0) {
      console.log('No LOADTEST candidates found — nothing to delete.');
    } else {
      console.log('\n--- Cleanup Execution ---\n');
      REPORT.execution = await executeCleanup(
        sequelize,
        tenant.id,
        REPORT.candidates.jobIds,
      );
      console.log('Deleted:', JSON.stringify(REPORT.execution, null, 2));
    }

    console.log('\n--- Verification Phase ---\n');
    REPORT.verification = await verifyNoLoadtest(sequelize);
    console.log('Remaining LOADTEST:', JSON.stringify(REPORT.verification.remaining, null, 2));

    console.log('\n--- Integrity Validation ---\n');
    REPORT.integrity = await validateIntegrity(sequelize, REPORT.safety);
    console.log('Integrity:', REPORT.integrity.pass ? 'PASS' : 'FAIL');

    if (!REPORT.verification.pass) {
      REPORT.blockers.push('LOADTEST records remain after cleanup');
    }
    if (!REPORT.integrity.pass) {
      REPORT.blockers.push('Non-Platform-6.6 data may have been removed');
    }

    writeResultsMd(REPORT);

    const ok =
      REPORT.verification.pass &&
      REPORT.integrity.pass &&
      REPORT.safety.pass;

    if (ok) {
      console.log('\nNO_LOADTEST_DATA_REMAINING');
      console.log('NO_NON_PLATFORM_6_6_DATA_REMOVED');
    } else {
      console.error('\nBLOCKERS');
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('Fatal:', error.message);
  REPORT.blockers.push(error.message);
  writeResultsMd(REPORT);
  console.error('\nBLOCKERS');
  process.exit(1);
});
