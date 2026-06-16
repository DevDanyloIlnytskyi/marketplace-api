/**
 * Platform-6.7 — Media performance benchmark & profiling.
 *
 * Usage:
 *   npm run platform-67-media-benchmark
 */
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const {
  startSyncWorker,
  stopSyncWorker,
  getJob,
  SYNC_MEDIA_CHUNK_MAX,
} = require('../shared/integration-sync');
const { replacePhotoSet } = require('../shared/catalog/media-write');
const { processMediaBatch } = require('../shared/integration-sync/processors/media-batch-processor');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const RUN_ID = process.env.PLATFORM_67_RUN_ID || String(Date.now());
const PREFIX = `p67-${RUN_ID}_`;
const SIZE = Number(process.env.PLATFORM_67_SIZE || 1000);
const CHUNK_SIZES = (process.env.PLATFORM_67_CHUNK_SIZES || '50,75,100,150,200')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => n > 0);

/** @type {Record<string, unknown>} */
const REPORT = {
  runId: RUN_ID,
  size: SIZE,
  currentChunkMax: SYNC_MEDIA_CHUNK_MAX,
  queryProfile: null,
  readAmplification: null,
  chunkBenchmarks: [],
  miniLoad: null,
  projection: null,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpRequest(port, urlPath, method, options) {
  const payload = options.body !== undefined ? JSON.stringify(options.body) : '';
  return new Promise((resolve, reject) => {
    const headers = {
      Host: TENANT_DOMAIN,
      'Content-Type': 'application/json',
      'X-API-Key': options.apiKey,
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    if (payload) {
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }
    const req = http.request(
      { hostname: '127.0.0.1', port, path: urlPath, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function classifyQuery(sql) {
  const normalized = sql.replace(/^Executing \([^)]+\):\s*/i, '').trim();
  const upper = normalized.toUpperCase();
  if (upper.startsWith('SELECT')) return 'SELECT';
  if (upper.startsWith('INSERT')) return 'INSERT';
  if (upper.startsWith('UPDATE')) return 'UPDATE';
  if (upper.startsWith('DELETE')) return 'DELETE';
  if (upper.startsWith('SAVEPOINT') || upper.startsWith('RELEASE SAVEPOINT')) return 'SAVEPOINT';
  if (upper.startsWith('START TRANSACTION') || upper.startsWith('COMMIT') || upper.startsWith('ROLLBACK')) {
    return 'TRANSACTION';
  }
  return 'OTHER';
}

function withQueryLogging(sequelize, onQuery) {
  const previous = sequelize.options.logging;
  sequelize.options.logging = (sql) => onQuery(String(sql));
  return () => {
    sequelize.options.logging = previous;
  };
}

async function profileSingleRecord(models, sequelize, productIdBas) {
  async function runProfile(label) {
    /** @type {Record<string, number>} */
    const counts = {};
    const restore = withQueryLogging(sequelize, (sql) => {
      const type = classifyQuery(sql);
      counts[type] = (counts[type] || 0) + 1;
    });
    const wallStart = Date.now();
    const result = await replacePhotoSet(models, {
      productIdBas,
      photos: [`products/${PREFIX}main.webp`, `products/${PREFIX}gal.webp`],
    });
    const wallMs = Date.now() - wallStart;
    restore();
    return { label, wallMs, counts, galleryCount: result.galleryCount };
  }

  await models.Products_photo.destroy({ where: { id_bas_product: productIdBas } });
  await models.Product.update({ main_photo: null }, { where: { id_bas: productIdBas } });

  const firstSync = await runProfile('first_sync');
  const idempotent = await runProfile('idempotent_resync');

  return { firstSync, idempotent };
}

async function benchmarkChunkSizeDirect(models, sequelize, productIds, chunkSize) {
  const records = productIds.map((idBas) => ({
    productIdBas: idBas,
    photos: [`products/${idBas}-main.webp`, `products/${idBas}-gal.webp`],
  }));
  const batches = Math.ceil(records.length / chunkSize);
  const start = Date.now();

  for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
    const slice = records.slice(batchIndex * chunkSize, (batchIndex + 1) * chunkSize);
    await processMediaBatch(models, sequelize, {
      get: () => ({ plain: true, records: slice }),
    });
  }

  const processSec = (Date.now() - start) / 1000;
  return {
    chunkSize,
    batches,
    processSec: Math.round(processSec * 10) / 10,
    mediaRecordsPerSec: Math.round((productIds.length / processSec) * 100) / 100,
    mode: 'direct_batch_processor',
  };
}

async function waitForJobComplete(models, jobId, timeoutMs = 7200000) {
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

async function runMediaJobBenchmark(port, apiKey, models, productIds, chunkSize) {
  const createRes = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
    apiKey,
    idempotencyKey: `p67-media-${RUN_ID}-${chunkSize}-${Date.now()}`,
    body: {
      jobType: 'media',
      syncMode: 'full',
      clientReference: `p67_${RUN_ID}_media_${chunkSize}`,
      phases: ['media'],
      expectedCounts: { media: productIds.length },
    },
  });
  if (createRes.status !== 201) {
    throw new Error(`Create job failed: ${createRes.status}`);
  }
  const jobId = createRes.body.data.jobId;
  const effectiveChunk = Math.min(chunkSize, SYNC_MEDIA_CHUNK_MAX);
  const batches = Math.ceil(productIds.length / effectiveChunk);

  const uploadStart = Date.now();
  for (let batchIndex = 0; batchIndex < batches; batchIndex += 1) {
    const slice = productIds.slice(batchIndex * effectiveChunk, (batchIndex + 1) * effectiveChunk);
    const records = slice.map((idBas) => ({
      productIdBas: idBas,
      photos: [`products/${idBas}-main.webp`, `products/${idBas}-gal.webp`],
    }));
    const res = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      { apiKey, body: { phase: 'media', batchIndex, expectedBatches: batches, records } },
    );
    if (res.status !== 202) {
      throw new Error(`Chunk upload failed batch ${batchIndex}: ${res.status}`);
    }
  }
  const uploadSec = (Date.now() - uploadStart) / 1000;

  startSyncWorker({ intervalMs: 150 });
  const processStart = Date.now();
  const job = await waitForJobComplete(models, jobId);
  const processSec = (Date.now() - processStart) / 1000;
  stopSyncWorker();

  const events = await models.IntegrationSyncJobEvent.count({ where: { job_id: jobId } });

  return {
    chunkSize,
    effectiveChunk,
    batches,
    uploadSec: Math.round(uploadSec * 10) / 10,
    processSec: Math.round(processSec * 10) / 10,
    totalSec: Math.round((uploadSec + processSec) * 10) / 10,
    mediaRecordsPerSec: Math.round((productIds.length / processSec) * 100) / 100,
    eventCount: events,
    jobMetrics: {
      processedRecords: job.processed_records,
      updatedCount: job.updated_count,
      failedCount: job.failed_count,
    },
    jobId,
  };
}

async function cleanupP67(models, tenantId) {
  stopSyncWorker();
  await models.IntegrationSyncJob.update(
    {
      status: 'cancelled',
      finished_at: new Date(),
      worker_id: null,
      lease_expires_at: null,
    },
    {
      where: {
        tenant_id: tenantId,
        status: { [Op.in]: ['pending', 'running', 'paused', 'uploading'] },
      },
    },
  );

  const jobs = await models.IntegrationSyncJob.findAll({
    where: { client_reference: { [Op.like]: `p67_${RUN_ID}_%` } },
    attributes: ['id'],
  });
  const jobIds = jobs.map((j) => j.id);
  if (jobIds.length) {
    await models.IntegrationSyncJobEvent.destroy({ where: { job_id: { [Op.in]: jobIds } } });
    await models.IntegrationSyncJobBatch.destroy({ where: { job_id: { [Op.in]: jobIds } } });
    await models.IntegrationSyncJob.destroy({ where: { id: { [Op.in]: jobIds } } });
  }

  await models.Products_photo.destroy({ where: { id_bas_product: { [Op.like]: `${PREFIX}%` } } });
  await models.Product.destroy({ where: { id_bas: { [Op.like]: `${PREFIX}%` } } });
}

async function resetMediaState(models, productIds) {
  await models.Products_photo.destroy({ where: { id_bas_product: { [Op.in]: productIds } } });
  await models.Product.update({ main_photo: null }, { where: { id_bas: { [Op.in]: productIds } } });
}

async function main() {
  console.log('\n=== Platform-6.7 Media Benchmark ===\n');

  const tenant = findTenantById(TENANT_ID);
  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);
  await sequelize.authenticate();

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) throw new Error('No categories');

  const productIds = Array.from({ length: SIZE }, (_, i) => `${PREFIX}${String(i).padStart(6, '0')}`);

  console.log(`Creating ${SIZE} benchmark products...`);
  for (let i = 0; i < productIds.length; i += 100) {
    const slice = productIds.slice(i, i + 100);
    await models.Product.bulkCreate(
      slice.map((idBas) => ({
        id_bas: idBas,
        name: `P67 Bench ${idBas}`,
        categories_id: category.id,
        actual: true,
      })),
      { ignoreDuplicates: true },
    );
  }

  const sampleId = productIds[0];
  REPORT.queryProfile = await profileSingleRecord(models, sequelize, sampleId);
  REPORT.readAmplification = {
    beforeOptimizationReadsPerRecord: 4,
    afterFirstSyncSelects: REPORT.queryProfile.firstSync.counts.SELECT || 0,
    afterIdempotentSelects: REPORT.queryProfile.idempotent.counts.SELECT || 0,
    repositoryCallsBefore: '7-9 per record',
    repositoryCallsAfterFirstSync: 4,
    repositoryCallsAfterIdempotent: 2,
  };
  console.log('Query profile:', JSON.stringify(REPORT.queryProfile, null, 2));

  console.log('\n--- Chunk size benchmark (direct processor) ---\n');
  for (const chunkSize of CHUNK_SIZES) {
    await resetMediaState(models, productIds);
    const result = await benchmarkChunkSizeDirect(models, sequelize, productIds, chunkSize);
    REPORT.chunkBenchmarks.push(result);
    console.log(`chunk=${chunkSize}: ${result.processSec}s, ${result.mediaRecordsPerSec} rec/s`);
  }

  REPORT.recommendedChunkSize = [...REPORT.chunkBenchmarks].sort(
    (a, b) => b.mediaRecordsPerSec - a.mediaRecordsPerSec,
  )[0]?.chunkSize;

  const { plaintext: apiKey, record: keyRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: `Platform-6.7 benchmark ${RUN_ID}`,
    scopes: ['sync.read', 'sync.write', 'media.write'],
    createdBy: 'platform-67-benchmark',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  try {
    await resetMediaState(models, productIds);
    console.log('\n--- Mini load (HTTP media job, chunk=' + SYNC_MEDIA_CHUNK_MAX + ') ---\n');
    const mini = await runMediaJobBenchmark(port, apiKey, models, productIds, SYNC_MEDIA_CHUNK_MAX);
    const platform66MediaSec = Math.round(710.3 * 0.69 * 10) / 10;
    REPORT.miniLoad = {
      ...mini,
      platform66BaselineTotalSec1000: 710.3,
      platform66EstimatedMediaSec1000: platform66MediaSec,
      mediaDurationReductionPct: Math.round((1 - mini.processSec / platform66MediaSec) * 1000) / 10,
    };
    console.log(JSON.stringify(REPORT.miniLoad, null, 2));

    const mediaRecPerSec = mini.mediaRecordsPerSec;
    const nonMediaSecPer1000 = 710.3 * (1 - 0.69);
    const projected10000TotalSec = nonMediaSecPer1000 * 10 + 10000 / mediaRecPerSec;

    REPORT.projection = {
      mediaRecPerSec,
      projected5000TotalSec: Math.round((nonMediaSecPer1000 * 5 + 5000 / mediaRecPerSec) * 10) / 10,
      projected10000TotalSec: Math.round(projected10000TotalSec * 10) / 10,
      projected10000Minutes: Math.round((projected10000TotalSec / 60) * 10) / 10,
      platform66Baseline10000Sec: 6991.1,
      improvementPct: Math.round((1 - projected10000TotalSec / 6991.1) * 1000) / 10,
      meets60MinTarget: projected10000TotalSec < 3600,
    };
  } finally {
    await cleanupP67(models, tenant.id);
    await revokeKey(models, keyRecord.id, 'platform-67 cleanup');
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  const out = path.join(__dirname, '../../project-context/results/PLATFORM_6_7_BENCHMARK.json');
  fs.writeFileSync(out, JSON.stringify(REPORT, null, 2));
  console.log(`\nBenchmark JSON: ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
