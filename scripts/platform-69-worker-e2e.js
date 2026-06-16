/**
 * Platform-6.9 — verify sync worker daemon processes jobs end-to-end.
 *
 * Spawns sync-worker-daemon.js as a separate process (production-like),
 * runs HTTP API in-process, creates 1 job + 1 chunk, verifies completion.
 *
 * Usage:
 *   npm run platform-69-worker-e2e
 *
 * Env (optional — defaults to first active tenant in registry):
 *   SMOKE_TENANT_ID=demo
 *   SMOKE_TENANT_DOMAIN=demo.local
 *   PLATFORM_69_USE_PM2=1   — skip daemon spawn; use running PM2 marketplace-sync-worker
 */
require('dotenv').config();

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { getJob, ACTIVE_SYNC_JOB_STATUSES } = require('../shared/integration-sync');
const { Op } = require('sequelize');

const smokeTenant = resolveSmokeTenant();
const TENANT_ID = smokeTenant.tenantId;
const TENANT_DOMAIN = smokeTenant.tenantDomain;
const RUN_ID = Date.now();
const PREFIX = `p69-${RUN_ID}_`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function record(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
}

function httpRequest(port, urlPath, method, options) {
  const payload = options.body !== undefined ? JSON.stringify(options.body) : '';
  return new Promise((resolve, reject) => {
    const headers = {
      Host: TENANT_DOMAIN,
      'Content-Type': 'application/json',
      'X-API-Key': options.apiKey,
    };
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let body = null;
          try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForJobComplete(models, jobId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await getJob(models, jobId);
    if (job?.status === 'completed') return job;
    if (job?.status === 'failed' || job?.status === 'cancelled') {
      throw new Error(`Job ended with status ${job?.status}`);
    }
    await sleep(400);
  }
  throw new Error(`Timeout waiting for job ${jobId}`);
}

async function main() {
  console.log('\n=== Platform-6.9 Worker E2E Verification ===\n');
  console.log(`[e2e] tenant=${TENANT_ID} domain=${TENANT_DOMAIN} source=${smokeTenant.source}`);

  const tenant = smokeTenant.tenant;
  const models = getTenantModels(tenant);

  await models.IntegrationSyncJob.update(
    {
      status: 'cancelled',
      finished_at: new Date(),
      worker_id: null,
      lease_expires_at: null,
    },
    {
      where: {
        tenant_id: tenant.id,
        status: { [Op.in]: [...ACTIVE_SYNC_JOB_STATUSES] },
        client_reference: { [Op.like]: 'p69-%' },
      },
    },
  );

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) throw new Error('No categories');

  const usePm2Worker = process.env.PLATFORM_69_USE_PM2 === '1'
    || process.env.PLATFORM_69_USE_PM2 === 'true';
  /** @type {import('child_process').ChildProcess | null} */
  let workerProc = null;

  if (usePm2Worker) {
    console.log('[e2e] using external worker (PM2) — daemon spawn skipped');
    record('worker_pm2_external', true);
  } else {
    const daemonPath = path.join(__dirname, 'sync-worker-daemon.js');
    workerProc = spawn(process.execPath, [daemonPath], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let workerStarted = false;
    workerProc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(`[worker] ${text}`);
      if (text.includes('worker started')) workerStarted = true;
    });
    workerProc.stderr.on('data', (chunk) => {
      process.stderr.write(`[worker] ${chunk.toString()}`);
    });

    await sleep(2000);
    record('worker_daemon_started', workerStarted);
  }

  const { plaintext: apiKey, record: keyRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: `Platform-6.9 worker e2e ${RUN_ID}`,
    scopes: ['sync.read', 'sync.write'],
    createdBy: 'platform-69-worker-e2e',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  try {
    const createRes = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: `P69-${RUN_ID}-job`,
      body: {
        jobType: 'products',
        syncMode: 'full',
        clientReference: `${PREFIX}job`,
        phases: ['products'],
        expectedCounts: { products: 1 },
      },
    });
    record('create_job', createRes.status === 201, `status=${createRes.status}`);
    const jobId = createRes.body.data.jobId;

    const chunkRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'products',
          batchIndex: 0,
          expectedBatches: 1,
          records: [{
            idBas: `${PREFIX}product`,
            name: 'P69 Worker E2E',
            categoryIdBas: category.id_bas,
          }],
        },
      },
    );
    record('upload_chunk', chunkRes.status === 202, `status=${chunkRes.status}`);

    const job = await waitForJobComplete(models, jobId);
    record('job_completed', job.status === 'completed', job.status);
    record('processed_records', job.processed_records === 1, String(job.processed_records));

    const batch = await models.IntegrationSyncJobBatch.findOne({
      where: { job_id: jobId, phase: 'products', batch_index: 0 },
    });
    record('batch_completed', batch?.status === 'completed', batch?.status);

    const events = await models.IntegrationSyncJobEvent.findAll({
      where: { job_id: jobId },
      attributes: ['event_type'],
    });
    const types = events.map((e) => e.event_type);
    record('event_batch_completed', types.includes('batch.completed'));
    record('event_job_completed', types.includes('job.completed'));

    const dbProduct = await models.Product.findOne({ where: { id_bas: `${PREFIX}product` } });
    record('product_in_db', !!dbProduct);

    console.log('\n=== PLATFORM-6.9 E2E PASSED ===\n');
  } finally {
    await revokeKey(models, keyRecord.id, 'platform-69 cleanup');
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    if (workerProc) {
      workerProc.kill('SIGTERM');
      await new Promise((resolve) => {
        workerProc.on('exit', () => resolve());
        setTimeout(resolve, 5000);
      });
    }
    await models.Product.destroy({ where: { id_bas: { [Op.like]: `${PREFIX}%` } } }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
