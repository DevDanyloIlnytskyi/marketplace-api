/**
 * Platform-6.2 — bulk product sync live validation on test_bd.
 *
 * Usage:
 *   npm run integration-sync-products:smoke
 */
require('dotenv').config();

const { Op } = require('sequelize');
const http = require('http');
const crypto = require('crypto');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const {
  startSyncWorker,
  stopSyncWorker,
  ACTIVE_SYNC_JOB_STATUSES,
  updateJob,
  getJob,
} = require('../shared/integration-sync');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const RUN_ID = Date.now();
const PRODUCT_PREFIX = `p62-${RUN_ID}`;

function record(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `: ${detail}` : ''}`);
  if (!ok) {
    throw new Error(`${name} failed${detail ? `: ${detail}` : ''}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {number} port
 * @param {string} urlPath
 * @param {'GET'|'POST'} method
 * @param {{ apiKey: string, idempotencyKey?: string, body?: object }} options
 */
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
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let body = null;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            body = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body });
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

async function waitForJobStatus(models, jobId, status, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await getJob(models, jobId);
    if (job?.status === status) {
      return job;
    }
    await sleep(300);
  }
  throw new Error(`Timeout waiting for job ${jobId} status ${status}`);
}

async function main() {
  console.log('\n=== Platform-6.2 Bulk Product Sync Smoke ===\n');

  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);
  await sequelize.authenticate();

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
        tenant_id: tenant.id,
        status: { [Op.in]: ACTIVE_SYNC_JOB_STATUSES },
      },
    },
  );

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No categories in test_bd');
  }
  const categoryIdBas = category.id_bas;

  const { plaintext: apiKey, record: keyRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-6.2 product sync smoke',
    scopes: ['sync.read', 'sync.write', 'catalog.read', 'catalog.write'],
    createdBy: 'integration-sync-products-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  startSyncWorker({ intervalMs: 400 });

  const productIds = [];

  try {
    const createJob = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: `p62-job-${RUN_ID}`,
      body: {
        jobType: 'products',
        syncMode: 'full',
        clientReference: `p62-smoke-${RUN_ID}`,
        expectedCounts: { products: 30 },
      },
    });
    record('create_job', createJob.status === 201, `status=${createJob.status}`);
    const jobId = createJob.body.data.jobId;

    const oversized = Array.from({ length: 101 }, (_, i) => ({
      idBas: `${PRODUCT_PREFIX}-big-${i}`,
      name: 'Too many',
      categoryIdBas,
    }));

    const tooBig = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'products',
          batchIndex: 99,
          expectedBatches: 3,
          records: oversized,
        },
      },
    );
    record(
      'chunk_limit',
      tooBig.status === 400 && tooBig.body?.code === 'CHUNK_SIZE_LIMIT_EXCEEDED',
      `status=${tooBig.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const idBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        productIds.push(idBas);
        return {
          idBas,
          name: `Platform 6.2 Product ${batchIndex}-${i}`,
          categoryIdBas,
        };
      });

      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        {
          apiKey,
          body: {
            phase: 'products',
            batchIndex,
            expectedBatches: 3,
            records,
          },
        },
      );
      record(`upload_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    const dup = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'products',
          batchIndex: 0,
          expectedBatches: 3,
          records: [
            {
              idBas: `${PRODUCT_PREFIX}-dup`,
              name: 'Dup',
              categoryIdBas,
            },
          ],
        },
      },
    );
    record(
      'duplicate_batch',
      dup.status === 409 && dup.body?.code === 'DUPLICATE_BATCH',
      `status=${dup.status}`,
    );

    const progressMid = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}`,
      'GET',
      { apiKey },
    );
    const productsProgress = progressMid.body?.data?.phaseUploadProgress?.products;
    record(
      'phase_progress',
      productsProgress?.expected === 3 && productsProgress?.uploaded === 3,
      JSON.stringify(productsProgress),
    );

    stopSyncWorker();
    await updateJob(models, jobId, {
      status: 'paused',
      worker_id: null,
      heartbeat_at: null,
      lease_expires_at: null,
    });

    const resumeRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/resume`,
      'POST',
      { apiKey, body: {} },
    );
    record('resume', resumeRes.status === 202, `status=${resumeRes.status}`);

    startSyncWorker({ intervalMs: 400 });

    const completedJob = await waitForJobStatus(models, jobId, 'completed');
    record('job_completion', completedJob.status === 'completed');

    const finalJob = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}`,
      'GET',
      { apiKey },
    );
    record(
      'metrics',
      finalJob.body?.data?.processedRecords === 30 &&
        finalJob.body?.data?.createdCount === 30,
      `processed=${finalJob.body?.data?.processedRecords} created=${finalJob.body?.data?.createdCount}`,
    );

    const finalProgress = finalJob.body?.data?.phaseUploadProgress?.products;
    record(
      'phase_completed',
      finalProgress?.completed === 3 && finalProgress?.uploaded === 3,
      JSON.stringify(finalProgress),
    );

    const dbCount = await models.Product.count({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_verification', dbCount === 30, `count=${dbCount}`);

    const eventsRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/events`,
      'GET',
      { apiKey },
    );
    const eventTypes = eventsRes.body?.data?.events?.map((e) => e.eventType) || [];
    record(
      'events',
      eventTypes.includes('batch.uploaded') &&
        eventTypes.includes('batch.completed') &&
        eventTypes.includes('phase.completed'),
      eventTypes.join(', '),
    );

    const putCheck = await httpRequest(
      port,
      `/api/integration/v1/products/${productIds[0]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p62-put-${RUN_ID}`,
        body: {
          name: 'Backward compat check',
          categoryIdBas,
        },
      },
    );
    record('backward_compat_put', putCheck.status === 200, `status=${putCheck.status}`);

    await models.Product.destroy({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });

    console.log('\n=== ALL PLATFORM-6.2 CHECKS PASSED ===\n');
    console.log('READY_FOR_PLATFORM_6_3');
  } finally {
    stopSyncWorker();
    await revokeKey(models, keyRecord.id, 'platform-62-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error('\nSMOKE FAILED:', error.message);
  console.error('\nBLOCKERS');
  process.exit(1);
});
