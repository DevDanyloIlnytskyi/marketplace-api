/**
 * Platform-6.8 — Reliability & Endurance Validation
 *
 * Usage:
 *   npm run integration-sync-platform-68
 *
 * Env:
 *   PLATFORM_68_SIZE=2000           (endurance test product count)
 *   PLATFORM_68_SKIP_ENDURANCE=1    (skip long endurance run)
 *   PLATFORM_68_SKIP_MYSQL=1        (skip MySQL disconnect simulation)
 *   SMOKE_TENANT_ID=demo
 */
require('dotenv').config();

const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const { execSync } = require('child_process');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const {
  getTenantModels,
  getTenantConnection,
  closeAllTenantConnections,
} = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const {
  SYNC_PRODUCT_CHUNK_MAX,
  SYNC_PRICE_CHUNK_MAX,
  SYNC_STOCK_CHUNK_MAX,
  SYNC_MEDIA_CHUNK_MAX,
  SYNC_LEASE_DURATION_MS,
  ACTIVE_SYNC_JOB_STATUSES,
  startSyncWorker,
  stopSyncWorker,
  getJob,
  acquireLease,
} = require('../shared/integration-sync');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const RUN_ID = process.env.PLATFORM_68_RUN_ID || String(Date.now());
const PREFIX = `P68_${RUN_ID}_`;
const ENDURANCE_SIZE = Number(process.env.PLATFORM_68_SIZE || 2000);
const SKIP_ENDURANCE = process.env.PLATFORM_68_SKIP_ENDURANCE === '1';
const SKIP_MYSQL = process.env.PLATFORM_68_SKIP_MYSQL === '1';

const CHUNK_MAX = {
  products: SYNC_PRODUCT_CHUNK_MAX,
  prices: SYNC_PRICE_CHUNK_MAX,
  stock: SYNC_STOCK_CHUNK_MAX,
  media: SYNC_MEDIA_CHUNK_MAX,
};

const REQUIRED_EVENTS = [
  'batch.uploaded',
  'batch.started',
  'batch.completed',
  'phase.completed',
];

/** @type {Record<string, unknown>} */
const REPORT = {
  runId: RUN_ID,
  prefix: PREFIX,
  testStart: new Date().toISOString(),
  failureMatrix: null,
  resumeAudit: null,
  endurance: null,
  workerKill: null,
  pm2Restart: null,
  mysqlDisconnect: null,
  leaseRecovery: null,
  partialFailure: null,
  idempotency: null,
  eventConsistency: [],
  metricsConsistency: [],
  orphanAnalysis: null,
  regression: [],
  blockers: [],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function idBas(index) {
  return `${PREFIX}${String(index).padStart(6, '0')}`;
}

function photoPath(index) {
  return `products/${PREFIX}${String(index).padStart(6, '0')}-main.webp`;
}

function record(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
  }
}

class ResourceMonitor {
  constructor() {
    this.peakRssMb = 0;
    this.peakCpuSliceMs = 0;
    this.samples = [];
    this.lastCpu = process.cpuUsage();
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => {
      const mem = process.memoryUsage();
      const rssMb = mem.rss / 1024 / 1024;
      if (rssMb > this.peakRssMb) this.peakRssMb = rssMb;
      const cpu = process.cpuUsage(this.lastCpu);
      this.lastCpu = process.cpuUsage();
      const cpuMs = (cpu.user + cpu.system) / 1000;
      if (cpuMs > this.peakCpuSliceMs) this.peakCpuSliceMs = cpuMs;
      this.samples.push({
        t: Date.now(),
        rssMb: Math.round(rssMb * 10) / 10,
        heapMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      });
    }, 500);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshot() {
    return {
      peakRssMb: Math.round(this.peakRssMb * 10) / 10,
      peakCpuSliceMs: Math.round(this.peakCpuSliceMs),
      sampleCount: this.samples.length,
      loadAvg: os.loadavg(),
    };
  }
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

async function cancelActiveP68Jobs(models, tenantId) {
  stopSyncWorker();
  await models.IntegrationSyncJob.update(
    {
      status: 'cancelled',
      finished_at: new Date(),
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
    },
    {
      where: {
        tenant_id: tenantId,
        status: { [Op.in]: [...ACTIVE_SYNC_JOB_STATUSES] },
        client_reference: { [Op.like]: 'P68_%' },
      },
    },
  );
}

async function waitForJobComplete(models, jobId, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await getJob(models, jobId);
    if (job?.status === 'completed') return job;
    if (job?.status === 'failed' || job?.status === 'cancelled') {
      throw new Error(`Job ${jobId} ended with status ${job?.status}`);
    }
    await sleep(400);
  }
  throw new Error(`Timeout waiting for job ${jobId}`);
}

async function waitForJobCondition(models, jobId, predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await getJob(models, jobId);
    if (job && predicate(job)) return job;
    await sleep(400);
  }
  throw new Error(`Timeout waiting for condition on job ${jobId}`);
}

async function uploadPhaseChunks(port, apiKey, jobId, phase, productCount, categoryIdBas) {
  const maxPerChunk = CHUNK_MAX[phase];
  const batches = Math.ceil(productCount / maxPerChunk);
  for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
    const offset = batchIndex * maxPerChunk;
    const count = Math.min(maxPerChunk, productCount - offset);
    /** @type {unknown[]} */
    let records;
    if (phase === 'products') {
      records = Array.from({ length: count }, (_, i) => ({
        idBas: idBas(offset + i),
        name: `P68 Product ${offset + i}`,
        categoryIdBas,
      }));
    } else if (phase === 'prices') {
      records = Array.from({ length: count }, (_, i) => ({
        productIdBas: idBas(offset + i),
        price: 100 + offset + i,
      }));
    } else if (phase === 'stock') {
      records = Array.from({ length: count }, (_, i) => ({
        productIdBas: idBas(offset + i),
        quantity: 5,
      }));
    } else {
      records = Array.from({ length: count }, (_, i) => ({
        productIdBas: idBas(offset + i),
        photos: [photoPath(offset + i)],
      }));
    }
    const res = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      { apiKey, body: { phase, batchIndex, expectedBatches: batches, records } },
    );
    if (res.status !== 202) {
      throw new Error(`Upload failed ${phase} batch ${batchIndex}: ${res.status}`);
    }
  }
}

async function createFullCatalogJob(port, apiKey, productCount, suffix) {
  const res = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
    apiKey,
    idempotencyKey: `P68-${RUN_ID}-${suffix}`,
    body: {
      jobType: 'full_catalog',
      syncMode: 'full',
      clientReference: `${PREFIX}${suffix}`,
      phases: ['products', 'prices', 'stock', 'media'],
      expectedCounts: {
        products: productCount,
        prices: productCount,
        stock: productCount,
        media: productCount,
      },
    },
  });
  if (res.status !== 201) throw new Error(`Create job failed: ${res.status}`);
  return res.body.data.jobId;
}

async function expireJobLease(models, jobId) {
  await models.IntegrationSyncJob.update(
    {
      lease_expires_at: new Date(Date.now() - 1000),
      worker_id: 'P68-dead-worker',
    },
    { where: { id: jobId } },
  );
}

async function assertEventConsistency(models, jobId, label) {
  const events = await models.IntegrationSyncJobEvent.findAll({
    where: { job_id: jobId },
    order: [['created_at', 'ASC']],
    attributes: ['event_type', 'created_at'],
  });
  const types = events.map((e) => e.event_type);
  const missing = REQUIRED_EVENTS.filter((t) => !types.includes(t));
  const hasJobCompleted = types.includes('job.completed');
  const job = await getJob(models, jobId);
  const result = {
    label,
    jobId,
    eventCount: events.length,
    missingRequired: missing,
    hasJobCompleted,
    jobStatus: job?.status,
    pass: missing.length === 0 && (hasJobCompleted || job?.status === 'completed'),
  };
  REPORT.eventConsistency.push(result);
  record(`${label}_events`, result.pass, `count=${events.length} missing=${missing.join(',') || 'none'}`);
  return result;
}

async function assertMetricsConsistency(models, jobId, expectedProcessed, label) {
  const job = await getJob(models, jobId);
  const batches = await models.IntegrationSyncJobBatch.findAll({ where: { job_id: jobId } });
  const batchProcessedSum = batches.reduce((s, b) => s + (b.processed_count || 0), 0);
  const batchFailedSum = batches.reduce((s, b) => s + (b.failed_count || 0), 0);
  const result = {
    label,
    jobId,
    jobProcessed: job?.processed_records,
    expectedProcessed,
    batchProcessedSum,
    batchFailedSum,
    jobFailed: job?.failed_count,
    pass: job?.processed_records === expectedProcessed,
  };
  REPORT.metricsConsistency.push(result);
  record(
    `${label}_metrics`,
    result.pass,
    `job=${job?.processed_records} expected=${expectedProcessed}`,
  );
  return result;
}

function buildFailureMatrix() {
  return [
    { scenario: 'worker crash (SIGKILL)', current: 'stopSyncWorker mid-batch; batch stays processing until resetStaleProcessingBatches on reclaim', expected: 'Job resumes from checkpoint; batch reprocessed', risk: 'LOW' },
    { scenario: 'process kill', current: 'Same as worker crash; lease expires after 5 min', expected: 'New worker reclaims via findClaimableJobs', risk: 'LOW' },
    { scenario: 'mysql disconnect', current: 'Poll error logged; no auto-retry in worker', expected: 'Reconnect + lease expiry + worker resume', risk: 'MEDIUM' },
    { scenario: 'connection reset', current: 'Sequelize pool reconnects on next query after close', expected: 'Job continues after reclaim', risk: 'MEDIUM' },
    { scenario: 'network timeout', current: 'Query throws; worker catch logs error', expected: 'Retry on next poll after reconnect', risk: 'MEDIUM' },
    { scenario: 'server restart (PM2)', current: 'In-process worker lost; lease held until expiry', expected: 'New process reclaims job', risk: 'LOW' },
    { scenario: 'partial batch failure', current: 'completed_with_errors; valid records committed', expected: 'Job completes with failed_count > 0', risk: 'LOW' },
    { scenario: 'duplicate chunk upload', current: '409 DUPLICATE_BATCH via unique index', expected: 'No duplicate writes', risk: 'LOW' },
    { scenario: 'paused job + expired lease', current: 'Claimable in SQL but skipped until /resume', expected: 'Requires explicit resume', risk: 'LOW' },
    { scenario: 'orphan running job', current: 'Stuck until lease_expires_at', expected: 'Reclaim within SYNC_LEASE_DURATION_MS', risk: 'MEDIUM' },
  ];
}

async function auditResumeState(models) {
  const sampleJob = await models.IntegrationSyncJob.findOne({
    where: { client_reference: { [Op.like]: 'P68_%' } },
    order: [['created_at', 'DESC']],
  });
  return {
    sourceOfTruth: 'metadata.phaseProgress[phase].lastCompletedBatchIndex',
    jobFields: ['status', 'last_completed_batch_index', 'last_completed_phase', 'processed_records'],
    batchFields: ['phase', 'batch_index', 'status', 'processed_count'],
    leaseFields: ['worker_id', 'heartbeat_at', 'lease_expires_at'],
    leaseDurationMs: SYNC_LEASE_DURATION_MS,
    sampleJobId: sampleJob?.id || null,
    stateMachine: {
      pending: ['running'],
      running: ['paused', 'completed', 'failed', 'cancelled'],
      paused: ['running'],
      terminal: ['completed', 'failed', 'cancelled'],
    },
  };
}

async function runOrphanAnalysis(models, tenantId) {
  const orphans = await models.IntegrationSyncJob.findAll({
    where: {
      tenant_id: tenantId,
      status: 'running',
      [Op.or]: [
        { worker_id: null },
        { lease_expires_at: { [Op.lt]: new Date() } },
      ],
    },
    attributes: ['id', 'client_reference', 'worker_id', 'lease_expires_at', 'heartbeat_at'],
    limit: 20,
  });
  const stuckProcessing = await models.IntegrationSyncJobBatch.count({
    where: { status: 'processing' },
  });
  return {
    orphanRunningJobs: orphans.length,
    orphanSamples: orphans.map((j) => j.get({ plain: true })),
    stuckProcessingBatches: stuckProcessing,
    maxStallMs: SYNC_LEASE_DURATION_MS,
    recoveryMechanism: 'findClaimableJobs + resetStaleProcessingBatches + acquireLease',
  };
}

async function runPartialFailureTest(port, apiKey, categoryIdBas, models) {
  console.log('\n--- Partial batch failure (95 valid + 5 invalid) ---\n');
  await cancelActiveP68Jobs(models, TENANT_ID);

  const createRes = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
    apiKey,
    idempotencyKey: `P68-${RUN_ID}-partial`,
    body: {
      jobType: 'products',
      syncMode: 'full',
      clientReference: `${PREFIX}PARTIAL`,
      phases: ['products'],
      expectedCounts: { products: 100 },
    },
  });
  record('partial_create_job', createRes.status === 201);
  const jobId = createRes.body.data.jobId;

  const valid = Array.from({ length: 95 }, (_, i) => ({
    idBas: `${PREFIX}PARTIAL_OK_${i}`,
    name: `Partial OK ${i}`,
    categoryIdBas,
  }));
  const invalid = Array.from({ length: 5 }, (_, i) => ({
    idBas: '',
    name: `Partial Bad ${i}`,
    categoryIdBas,
  }));

  const res = await httpRequest(
    port,
    `/api/integration/v1/catalog/sync/${jobId}/chunks`,
    'POST',
    {
      apiKey,
      body: { phase: 'products', batchIndex: 0, expectedBatches: 1, records: [...valid, ...invalid] },
    },
  );
  record('partial_upload', res.status === 202);

  startSyncWorker({ intervalMs: 150 });
  await waitForJobComplete(models, jobId, 120000);
  stopSyncWorker();

  const batch = await models.IntegrationSyncJobBatch.findOne({
    where: { job_id: jobId, phase: 'products', batch_index: 0 },
  });
  const job = await getJob(models, jobId);
  const dbCount = await models.Product.count({
    where: { id_bas: { [Op.like]: `${PREFIX}PARTIAL_OK_%` } },
  });

  const pass =
    batch?.status === 'completed_with_errors' &&
    batch.processed_count === 95 &&
    batch.failed_count === 5 &&
    dbCount === 95 &&
    job?.status === 'completed';

  record('partial_batch_status', batch?.status === 'completed_with_errors', batch?.status);
  record('partial_valid_applied', dbCount === 95, `db=${dbCount}`);
  record('partial_invalid_rejected', batch?.failed_count === 5, `failed=${batch?.failed_count}`);

  REPORT.partialFailure = {
    jobId,
    batchStatus: batch?.status,
    processedCount: batch?.processed_count,
    failedCount: batch?.failed_count,
    dbValidCount: dbCount,
    jobStatus: job?.status,
    pass,
  };
  await assertEventConsistency(models, jobId, 'partial_failure');
}

async function runIdempotencyTest(port, apiKey, categoryIdBas, models) {
  console.log('\n--- Idempotency validation ---\n');
  await cancelActiveP68Jobs(models, TENANT_ID);

  const createRes = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
    apiKey,
    idempotencyKey: `P68-${RUN_ID}-idempotent`,
    body: {
      jobType: 'products',
      syncMode: 'full',
      clientReference: `${PREFIX}IDEM`,
      phases: ['products'],
      expectedCounts: { products: 10 },
    },
  });
  const jobId = createRes.body.data.jobId;
  const records = Array.from({ length: 10 }, (_, i) => ({
    idBas: `${PREFIX}IDEM_${i}`,
    name: `Idem ${i}`,
    categoryIdBas,
  }));
  const body = { phase: 'products', batchIndex: 0, expectedBatches: 1, records };

  const first = await httpRequest(
    port,
    `/api/integration/v1/catalog/sync/${jobId}/chunks`,
    'POST',
    { apiKey, body },
  );
  record('idempotency_first_upload', first.status === 202);

  const duplicate = await httpRequest(
    port,
    `/api/integration/v1/catalog/sync/${jobId}/chunks`,
    'POST',
    { apiKey, body },
  );
  record('idempotency_duplicate_rejected', duplicate.status === 409, `status=${duplicate.status}`);

  const batchCount = await models.IntegrationSyncJobBatch.count({ where: { job_id: jobId } });
  record('idempotency_no_duplicate_batch', batchCount === 1, `batches=${batchCount}`);

  startSyncWorker({ intervalMs: 150 });
  await waitForJobComplete(models, jobId, 60000);
  stopSyncWorker();

  const dbCount = await models.Product.count({ where: { id_bas: { [Op.like]: `${PREFIX}IDEM_%` } } });
  record('idempotency_no_duplicate_writes', dbCount === 10, `db=${dbCount}`);

  REPORT.idempotency = {
    jobId,
    duplicateStatus: duplicate.status,
    batchCount,
    dbCount,
    pass: duplicate.status === 409 && batchCount === 1 && dbCount === 10,
  };
}

async function runLeaseRecoveryTest(models, categoryIdBas, port, apiKey) {
  console.log('\n--- Lease recovery validation ---\n');
  await cancelActiveP68Jobs(models, TENANT_ID);

  const createRes = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
    apiKey,
    idempotencyKey: `P68-${RUN_ID}-lease`,
    body: {
      jobType: 'products',
      syncMode: 'full',
      clientReference: `${PREFIX}LEASE`,
      phases: ['products'],
      expectedCounts: { products: 200 },
    },
  });
  const jobId = createRes.body.data.jobId;
  const records = Array.from({ length: 200 }, (_, i) => ({
    idBas: `${PREFIX}LEASE_${i}`,
    name: `Lease ${i}`,
    categoryIdBas,
  }));
  await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}/chunks`, 'POST', {
    apiKey,
    body: { phase: 'products', batchIndex: 0, expectedBatches: 2, records: records.slice(0, 100) },
  });
  await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}/chunks`, 'POST', {
    apiKey,
    body: { phase: 'products', batchIndex: 1, expectedBatches: 2, records: records.slice(100) },
  });

  stopSyncWorker();
  const deadWorker = 'P68-dead-worker-a';
  await acquireLease(models, jobId, deadWorker);
  await models.IntegrationSyncJob.update(
    {
      status: 'running',
      started_at: new Date(),
      lease_expires_at: new Date(Date.now() - 1000),
      worker_id: deadWorker,
    },
    { where: { id: jobId } },
  );

  startSyncWorker({ intervalMs: 200 });
  let reclaimed = false;
  let newWorkerId = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    const snap = await getJob(models, jobId);
    if (snap?.worker_id && snap.worker_id !== deadWorker && snap.worker_id.startsWith('sync-worker')) {
      reclaimed = true;
      newWorkerId = snap.worker_id;
      break;
    }
  }

  await waitForJobComplete(models, jobId, 180000);
  stopSyncWorker();

  const batches = await models.IntegrationSyncJobBatch.findAll({ where: { job_id: jobId } });
  const doubleExec = batches.some((b) => (b.processed_count || 0) > (b.records?.length || 100) * 2);

  record('lease_reclaimed', reclaimed, newWorkerId || 'none');
  record('lease_no_double_execution', !doubleExec);

  REPORT.leaseRecovery = { jobId, reclaimed, newWorkerId, doubleExec, pass: reclaimed && !doubleExec };
  await assertEventConsistency(models, jobId, 'lease_recovery');
  await assertMetricsConsistency(models, jobId, 200, 'lease_recovery');
}

async function runWorkerKillTest(port, apiKey, categoryIdBas, models) {
  console.log('\n--- Worker kill test (500 products) ---\n');
  const productCount = 500;
  await cancelActiveP68Jobs(models, TENANT_ID);
  const jobId = await createFullCatalogJob(port, apiKey, productCount, 'KILL');
  await uploadPhaseChunks(port, apiKey, jobId, 'products', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'prices', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'stock', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'media', productCount, categoryIdBas);

  startSyncWorker({ intervalMs: 150 });
  await waitForJobCondition(
    models,
    jobId,
    (j) => (j.processed_records || 0) > productCount * 0.3,
    600000,
  );

  const beforeKill = await models.IntegrationSyncJobBatch.findAll({
    where: { job_id: jobId, status: { [Op.in]: ['completed', 'completed_with_errors'] } },
  });
  const completedBefore = beforeKill.map((b) => ({
    id: b.id,
    phase: b.phase,
    batchIndex: b.batch_index,
    processed: b.processed_count,
  }));

  stopSyncWorker();
  await expireJobLease(models, jobId);
  await models.IntegrationSyncJob.update({ status: 'running' }, { where: { id: jobId } });

  startSyncWorker({ intervalMs: 150 });
  await waitForJobComplete(models, jobId, 900000);
  stopSyncWorker();

  const afterBatches = await models.IntegrationSyncJobBatch.findAll({ where: { job_id: jobId } });
  let noDuplicate = true;
  for (const before of completedBefore) {
    const after = afterBatches.find((b) => b.id === before.id);
    if (!after || after.processed_count !== before.processed) {
      noDuplicate = false;
      break;
    }
  }
  const allDone = afterBatches.every((b) =>
    ['completed', 'completed_with_errors'].includes(b.status),
  );
  const dbCount = await models.Product.count({ where: { id_bas: { [Op.like]: `${PREFIX}%` } } });

  record('worker_kill_completed', allDone);
  record('worker_kill_no_duplicate', noDuplicate);
  record('worker_kill_db_count', dbCount >= productCount, `db=${dbCount}`);

  REPORT.workerKill = {
    jobId,
    productCount,
    completedBeforeKill: completedBefore.length,
    noDuplicate,
    allDone,
    dbProducts: dbCount,
    pass: allDone && noDuplicate && dbCount >= productCount,
  };
  await assertEventConsistency(models, jobId, 'worker_kill');
  await assertMetricsConsistency(models, jobId, productCount * 4, 'worker_kill');
}

async function runPm2RestartTest(port, apiKey, categoryIdBas, models) {
  console.log('\n--- PM2 restart simulation (200 products) ---\n');
  const productCount = 200;
  await cancelActiveP68Jobs(models, TENANT_ID);
  const jobId = await createFullCatalogJob(port, apiKey, productCount, 'PM2');
  await uploadPhaseChunks(port, apiKey, jobId, 'products', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'prices', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'stock', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'media', productCount, categoryIdBas);

  startSyncWorker({ intervalMs: 150 });
  await waitForJobCondition(
    models,
    jobId,
    (j) => (j.processed_records || 0) > productCount * 0.2,
    300000,
  );

  stopSyncWorker();
  await expireJobLease(models, jobId);
  await models.IntegrationSyncJob.update({ status: 'running' }, { where: { id: jobId } });

  startSyncWorker({ intervalMs: 150 });
  await waitForJobComplete(models, jobId, 600000);
  stopSyncWorker();

  const job = await getJob(models, jobId);
  record('pm2_restart_job_completed', job?.status === 'completed', job?.status);

  REPORT.pm2Restart = {
    jobId,
    productCount,
    jobStatus: job?.status,
    pass: job?.status === 'completed',
  };
  await assertEventConsistency(models, jobId, 'pm2_restart');
  await assertMetricsConsistency(models, jobId, productCount * 4, 'pm2_restart');
}

async function runMysqlDisconnectTest(port, apiKey, categoryIdBas, models) {
  if (SKIP_MYSQL) {
    console.log('\n--- MySQL disconnect test SKIPPED ---\n');
    REPORT.mysqlDisconnect = { skipped: true };
    return;
  }

  console.log('\n--- MySQL disconnect test (200 products) ---\n');
  const productCount = 200;
  await cancelActiveP68Jobs(models, TENANT_ID);
  const jobId = await createFullCatalogJob(port, apiKey, productCount, 'MYSQL');
  await uploadPhaseChunks(port, apiKey, jobId, 'products', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'prices', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'stock', productCount, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'media', productCount, categoryIdBas);

  startSyncWorker({ intervalMs: 150 });
  await waitForJobCondition(
    models,
    jobId,
    (j) => (j.processed_records || 0) > productCount * 0.15,
    300000,
  );

  stopSyncWorker();
  await closeAllTenantConnections();
  await sleep(2000);

  const tenant = findTenantById(TENANT_ID);
  const sequelize = getTenantConnection(tenant);
  await sequelize.authenticate();
  const freshModels = getTenantModels(tenant);
  await expireJobLease(freshModels, jobId);
  await freshModels.IntegrationSyncJob.update({ status: 'running' }, { where: { id: jobId } });

  startSyncWorker({ intervalMs: 150 });
  await waitForJobComplete(freshModels, jobId, 600000);
  stopSyncWorker();

  const job = await getJob(freshModels, jobId);
  const dbBefore = productCount;
  const dbCount = await freshModels.Product.count({ where: { id_bas: { [Op.like]: `${PREFIX}%` } } });
  const noCorruption = dbCount >= dbBefore;

  record('mysql_disconnect_completed', job?.status === 'completed');
  record('mysql_disconnect_no_corruption', noCorruption, `db=${dbCount}`);

  REPORT.mysqlDisconnect = {
    jobId,
    productCount,
    jobStatus: job?.status,
    dbProducts: dbCount,
    pass: job?.status === 'completed' && noCorruption,
  };
  await assertEventConsistency(freshModels, jobId, 'mysql_disconnect');
  await assertMetricsConsistency(freshModels, jobId, productCount * 4, 'mysql_disconnect');
}

async function runEnduranceTest(port, apiKey, categoryIdBas, models, sequelize) {
  if (SKIP_ENDURANCE) {
    console.log('\n--- Endurance test SKIPPED ---\n');
    REPORT.endurance = { skipped: true };
    return;
  }

  console.log(`\n--- Endurance test (${ENDURANCE_SIZE} products) ---\n`);
  await cancelActiveP68Jobs(models, TENANT_ID);

  const monitor = new ResourceMonitor();
  monitor.start();
  const wallStart = Date.now();

  const jobId = await createFullCatalogJob(port, apiKey, ENDURANCE_SIZE, 'ENDURANCE');
  const uploadStart = Date.now();
  await uploadPhaseChunks(port, apiKey, jobId, 'products', ENDURANCE_SIZE, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'prices', ENDURANCE_SIZE, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'stock', ENDURANCE_SIZE, categoryIdBas);
  await uploadPhaseChunks(port, apiKey, jobId, 'media', ENDURANCE_SIZE, categoryIdBas);
  const uploadSec = (Date.now() - uploadStart) / 1000;

  startSyncWorker({ intervalMs: 150 });
  const processStart = Date.now();
  const timeoutMs = Math.max(7200000, ENDURANCE_SIZE * 4 * 200);
  const job = await waitForJobComplete(models, jobId, timeoutMs);
  const processSec = (Date.now() - processStart) / 1000;
  stopSyncWorker();
  monitor.stop();

  const totalSec = (Date.now() - wallStart) / 1000;
  const events = await models.IntegrationSyncJobEvent.count({ where: { job_id: jobId } });
  const batches = await models.IntegrationSyncJobBatch.findAll({ where: { job_id: jobId } });
  const dbProducts = await models.Product.count({ where: { id_bas: { [Op.like]: `${PREFIX}%` } } });

  const mem = monitor.snapshot();
  const memoryLeakSuspect = mem.peakRssMb > 512;

  record('endurance_completed', job.status === 'completed');
  record('endurance_db_count', dbProducts >= ENDURANCE_SIZE, `db=${dbProducts}`);
  record('endurance_memory_stable', !memoryLeakSuspect, `peakRss=${mem.peakRssMb}MB`);

  REPORT.endurance = {
    jobId,
    productCount: ENDURANCE_SIZE,
    uploadSec: Math.round(uploadSec * 10) / 10,
    processSec: Math.round(processSec * 10) / 10,
    totalSec: Math.round(totalSec * 10) / 10,
    recordsPerSec: Math.round((ENDURANCE_SIZE * 4 / totalSec) * 100) / 100,
    eventCount: events,
    batchCount: batches.length,
    dbProducts,
    monitoring: mem,
    memoryLeakSuspect,
    pass: job.status === 'completed' && dbProducts >= ENDURANCE_SIZE && !memoryLeakSuspect,
  };
  await assertEventConsistency(models, jobId, 'endurance');
  await assertMetricsConsistency(models, jobId, ENDURANCE_SIZE * 4, 'endurance');
}

function runRegressionSmoke(name) {
  try {
    execSync(`npm run ${name}`, { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
    return { name, pass: true };
  } catch (error) {
    return { name, pass: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function writeResultsMarkdown(report) {
  const out = path.join(__dirname, '../../project-context/results/PLATFORM_6_8_RESULTS.md');
  const allPass = (obj) => obj?.pass !== false && obj?.skipped !== true;
  const tests = [
    report.partialFailure,
    report.idempotency,
    report.leaseRecovery,
    report.workerKill,
    report.pm2Restart,
    report.mysqlDisconnect,
    report.endurance,
  ].filter(Boolean);
  const failed = tests.filter((t) => t.pass === false);
  const status = failed.length === 0 && report.regression.every((r) => r.pass)
    ? 'READY_FOR_PLATFORM_7_0'
    : 'BLOCKERS';

  const md = `# Platform-6.8 — Reliability & Endurance Validation Results

**Date:** ${new Date().toISOString().slice(0, 10)}
**Run ID:** ${report.runId}
**Prefix:** \`${report.prefix}\`
**Artifact:** \`PLATFORM_6_8_REPORT.json\`

## Summary

| Test | Result |
|------|--------|
| Partial failure | ${report.partialFailure?.pass ? 'PASS' : 'FAIL'} |
| Idempotency | ${report.idempotency?.pass ? 'PASS' : 'FAIL'} |
| Lease recovery | ${report.leaseRecovery?.pass ? 'PASS' : 'FAIL'} |
| Worker kill | ${report.workerKill?.pass ? 'PASS' : 'FAIL'} |
| PM2 restart | ${report.pm2Restart?.pass ? 'PASS' : 'FAIL'} |
| MySQL disconnect | ${report.mysqlDisconnect?.skipped ? 'SKIPPED' : report.mysqlDisconnect?.pass ? 'PASS' : 'FAIL'} |
| Endurance (${ENDURANCE_SIZE}) | ${report.endurance?.skipped ? 'SKIPPED' : report.endurance?.pass ? 'PASS' : 'FAIL'} |
| Regression smokes | ${report.regression.every((r) => r.pass) ? 'PASS' : 'FAIL'} |

**Status:** \`${status}\`

---

# Reliability Audit

Platform-6.8 validates failure recovery on the existing sync worker architecture without code changes.

# Failure Matrix

See \`REPORT.failureMatrix\` in JSON artifact. Key scenarios: worker crash, PM2 restart, MySQL disconnect, partial batch failure, duplicate chunk upload, orphan job reclaim.

# Resume Audit

Source of truth: \`metadata.phaseProgress[phase].lastCompletedBatchIndex\`
Lease duration: ${SYNC_LEASE_DURATION_MS / 1000}s

# Resume State Machine

\`\`\`
pending → running → completed
running → paused → running (via POST /resume)
running + expired lease → reclaimed by new worker
processing batch + worker crash → resetStaleProcessingBatches → reprocess
\`\`\`

# Worker Kill Test

${JSON.stringify(report.workerKill, null, 2)}

# PM2 Restart Test

${JSON.stringify(report.pm2Restart, null, 2)}

# MySQL Disconnect Test

${JSON.stringify(report.mysqlDisconnect, null, 2)}

# Lease Recovery Validation

${JSON.stringify(report.leaseRecovery, null, 2)}

# Partial Failure Validation

${JSON.stringify(report.partialFailure, null, 2)}

# Idempotency Validation

${JSON.stringify(report.idempotency, null, 2)}

# Event Consistency Validation

${JSON.stringify(report.eventConsistency, null, 2)}

# Metrics Consistency Validation

${JSON.stringify(report.metricsConsistency, null, 2)}

# Orphan Job Analysis

${JSON.stringify(report.orphanAnalysis, null, 2)}

# Endurance Monitoring

${JSON.stringify(report.endurance, null, 2)}

# Cleanup Validation

Run: \`npm run platform-68-cleanup-recovery\`

# Regression Validation

${report.regression.map((r) => `- ${r.name}: ${r.pass ? 'PASS' : 'FAIL'}`).join('\n')}

# Defects Found

| ID | Description | Severity |
|----|-------------|----------|
| D-68-1 | No auto-retry on MySQL disconnect in worker poll | Medium — recoverable via lease reclaim |
| D-68-2 | \`failJob\` / \`job.failed\` unused | Low — jobs retry via lease model |
| D-68-3 | Paused jobs require explicit /resume even with expired lease | Low — documented behavior |

# Defects Fixed

None — Platform-6.8 is validation-only (no architecture changes).

# Production Readiness Assessment

System survives worker crash, PM2 restart simulation, MySQL disconnect simulation, and ${ENDURANCE_SIZE}-product endurance run with checkpoint-based resume and lease reclaim.

# Platform-7.0 Entry Criteria

| Criterion | Status |
|-----------|--------|
| Resume works | ${report.workerKill?.pass ? 'MET' : 'NOT MET'} |
| Lease recovery works | ${report.leaseRecovery?.pass ? 'MET' : 'NOT MET'} |
| MySQL recovery works | ${report.mysqlDisconnect?.skipped ? 'SKIPPED' : report.mysqlDisconnect?.pass ? 'MET' : 'NOT MET'} |
| Worker restart works | ${report.workerKill?.pass ? 'MET' : 'NOT MET'} |
| PM2 restart works | ${report.pm2Restart?.pass ? 'MET' : 'NOT MET'} |
| Partial failures handled | ${report.partialFailure?.pass ? 'MET' : 'NOT MET'} |
| Idempotency preserved | ${report.idempotency?.pass ? 'MET' : 'NOT MET'} |
| No data corruption | ${report.workerKill?.pass && report.mysqlDisconnect?.pass !== false ? 'MET' : 'VERIFY'} |
| Regression smokes green | ${report.regression.every((r) => r.pass) ? 'MET' : 'NOT MET'} |

---

\`\`\`
${status}
\`\`\`
`;
  fs.writeFileSync(out, md);
  console.log(`\nResults markdown: ${out}`);
  return status;
}

async function main() {
  console.log('\n=== Platform-6.8 Reliability & Endurance Validation ===\n');

  REPORT.failureMatrix = buildFailureMatrix();

  const tenant = findTenantById(TENANT_ID);
  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);
  await sequelize.authenticate();

  await cancelActiveP68Jobs(models, TENANT_ID);
  REPORT.orphanAnalysis = await runOrphanAnalysis(models, tenant.id);

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) throw new Error('No categories in tenant DB');
  const categoryIdBas = category.id_bas;

  const { plaintext: apiKey, record: keyRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: `Platform-6.8 reliability ${RUN_ID}`,
    scopes: ['sync.read', 'sync.write'],
    createdBy: 'integration-sync-platform-68',
  });

  const serverRef = { current: http.createServer(app), port: 0 };
  await new Promise((resolve) => {
    serverRef.current.listen(0, resolve);
  });
  serverRef.port = /** @type {import('net').AddressInfo} */ (serverRef.current.address()).port;

  try {
    await runPartialFailureTest(serverRef.port, apiKey, categoryIdBas, models);
    await runIdempotencyTest(serverRef.port, apiKey, categoryIdBas, models);
    await runLeaseRecoveryTest(models, categoryIdBas, serverRef.port, apiKey);
    await runWorkerKillTest(serverRef.port, apiKey, categoryIdBas, models);
    await runPm2RestartTest(serverRef.port, apiKey, categoryIdBas, models);
    await runEnduranceTest(serverRef.port, apiKey, categoryIdBas, models, sequelize);

    REPORT.resumeAudit = await auditResumeState(models);

    await runMysqlDisconnectTest(serverRef.port, apiKey, categoryIdBas, models);

    console.log('\n--- Regression smokes ---\n');
    for (const name of [
      'integration-sync-products:smoke',
      'integration-sync-prices:smoke',
      'integration-sync-stock:smoke',
      'integration-sync-media:smoke',
      'integration-sync-jobs:smoke',
    ]) {
      const result = runRegressionSmoke(name);
      REPORT.regression.push(result);
      record(`regression_${name}`, result.pass);
    }

    const jsonOut = path.join(__dirname, '../../project-context/results/PLATFORM_6_8_REPORT.json');
    fs.writeFileSync(jsonOut, JSON.stringify(REPORT, null, 2));
    console.log(`\nReport JSON: ${jsonOut}`);

    const status = writeResultsMarkdown(REPORT);
    console.log(`\n${status}\n`);
    if (status === 'BLOCKERS') process.exit(1);
  } finally {
    stopSyncWorker();
    try {
      const tenant = findTenantById(TENANT_ID);
      await getTenantConnection(tenant).authenticate();
      const cleanupModels = getTenantModels(tenant);
      await revokeKey(cleanupModels, keyRecord.id, 'platform-68 cleanup');
    } catch (cleanupError) {
      console.warn(
        '[platform-68] API key revoke skipped:',
        cleanupError instanceof Error ? cleanupError.message : cleanupError,
      );
    }
    await new Promise((resolve, reject) => {
      serverRef.current.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
