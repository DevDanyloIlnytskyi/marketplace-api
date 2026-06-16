/**
 * Platform-6.3 — bulk product + price sync live validation on test_bd.
 *
 * Usage:
 *   npm run integration-sync-prices:smoke
 */
require('dotenv').config();

const { Op } = require('sequelize');
const http = require('http');
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
const PRODUCT_PREFIX = `p63-${RUN_ID}`;

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
 * @param {'GET'|'POST'|'PUT'} method
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

async function waitForJobStatus(models, jobId, status, timeoutMs = 90000) {
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

async function waitForCondition(checkFn, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await checkFn();
    if (result) {
      return result;
    }
    await sleep(300);
  }
  throw new Error('Timeout waiting for condition');
}

async function main() {
  console.log('\n=== Platform-6.3 Bulk Product + Price Sync Smoke ===\n');

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
    label: 'Platform-6.3 product+price sync smoke',
    scopes: ['sync.read', 'sync.write', 'catalog.read', 'catalog.write', 'prices.write'],
    createdBy: 'integration-sync-prices-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  startSyncWorker({ intervalMs: 400 });

  const productIds = [];

  try {
    const createJob = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: `p63-job-${RUN_ID}`,
      body: {
        jobType: 'full_catalog',
        syncMode: 'full',
        clientReference: `p63-smoke-${RUN_ID}`,
        phases: ['products', 'prices'],
        expectedCounts: { products: 30, prices: 30 },
      },
    });
    record('create_job', createJob.status === 201, `status=${createJob.status}`);
    const jobId = createJob.body.data.jobId;

    const unsupported = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'attributes',
          batchIndex: 0,
          expectedBatches: 1,
          records: [{ idBas: 'x' }],
        },
      },
    );
    record(
      'unsupported_phase',
      unsupported.status === 400 && unsupported.body?.code === 'UNSUPPORTED_PHASE',
      `status=${unsupported.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const idBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        productIds.push(idBas);
        return {
          idBas,
          name: `Platform 6.3 Product ${batchIndex}-${i}`,
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
      record(`upload_product_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    await waitForCondition(async () => {
      const jobRes = await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}`, 'GET', {
        apiKey,
      });
      const productsProgress = jobRes.body?.data?.phaseUploadProgress?.products;
      return productsProgress?.uploaded === 3 ? jobRes : null;
    });

    const afterProductsUpload = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}`,
      'GET',
      { apiKey },
    );
    record(
      'job_running_after_products_upload_only',
      afterProductsUpload.body?.data?.status === 'running' ||
        afterProductsUpload.body?.data?.status === 'pending',
      `status=${afterProductsUpload.body?.data?.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const productIdBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        return {
          productIdBas,
          price: 1000 + batchIndex * 100 + i,
          actionPrice: batchIndex === 0 && i === 0 ? 900 : null,
        };
      });

      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        {
          apiKey,
          body: {
            phase: 'prices',
            batchIndex,
            expectedBatches: 3,
            records,
          },
        },
      );
      record(`upload_price_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    const dup = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'prices',
          batchIndex: 0,
          expectedBatches: 3,
          records: [{ productIdBas: productIds[0], price: 1 }],
        },
      },
    );
    record(
      'duplicate_price_batch',
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
    const pricesProgress = progressMid.body?.data?.phaseUploadProgress?.prices;
    record(
      'phase_progress_both',
      productsProgress?.expected === 3 &&
        productsProgress?.uploaded === 3 &&
        pricesProgress?.expected === 3 &&
        pricesProgress?.uploaded === 3,
      JSON.stringify({ products: productsProgress, prices: pricesProgress }),
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
      finalJob.body?.data?.processedRecords === 60 &&
        finalJob.body?.data?.createdCount >= 30,
      `processed=${finalJob.body?.data?.processedRecords} created=${finalJob.body?.data?.createdCount} updated=${finalJob.body?.data?.updatedCount}`,
    );

    const finalProducts = finalJob.body?.data?.phaseUploadProgress?.products;
    const finalPrices = finalJob.body?.data?.phaseUploadProgress?.prices;
    record(
      'phase_completed_both',
      finalProducts?.completed === 3 &&
        finalProducts?.uploaded === 3 &&
        finalPrices?.completed === 3 &&
        finalPrices?.uploaded === 3,
      JSON.stringify({ products: finalProducts, prices: finalPrices }),
    );

    const dbProductCount = await models.Product.count({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_products', dbProductCount === 30, `count=${dbProductCount}`);

    const dbPriceCount = await models.Products_price.count({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_prices', dbPriceCount === 30, `count=${dbPriceCount}`);

    const eventsRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/events`,
      'GET',
      { apiKey },
    );
    const events = eventsRes.body?.data?.events || [];
    const eventTypes = events.map((e) => e.eventType);
    const priceEvents = events.filter((e) => e.phase === 'prices');
    record(
      'events',
      eventTypes.includes('batch.uploaded') &&
        eventTypes.includes('batch.completed') &&
        eventTypes.includes('phase.completed') &&
        priceEvents.some((e) => e.eventType === 'batch.uploaded') &&
        priceEvents.some((e) => e.eventType === 'phase.completed'),
      `${eventTypes.join(', ')}; priceEvents=${priceEvents.length}`,
    );

    const putPrice = await httpRequest(
      port,
      `/api/integration/v1/prices/${productIds[0]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p63-price-put-${RUN_ID}`,
        body: { price: 7777 },
      },
    );
    record('backward_compat_put_price', putPrice.status === 200, `status=${putPrice.status}`);

    const putProduct = await httpRequest(
      port,
      `/api/integration/v1/products/${productIds[0]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p63-product-put-${RUN_ID}`,
        body: { name: 'Backward compat check', categoryIdBas },
      },
    );
    record('backward_compat_put_product', putProduct.status === 200, `status=${putProduct.status}`);

    await models.Products_price.destroy({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    await models.Product.destroy({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });

    console.log('\n=== ALL PLATFORM-6.3 CHECKS PASSED ===\n');
    console.log('READY_FOR_PLATFORM_6_4');
  } finally {
    stopSyncWorker();
    await revokeKey(models, keyRecord.id, 'platform-63-smoke cleanup');
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
