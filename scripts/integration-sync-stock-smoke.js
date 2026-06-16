/**
 * Platform-6.4 — bulk product + price + stock sync live validation on test_bd.
 *
 * Usage:
 *   npm run integration-sync-stock:smoke
 */
require('dotenv').config();

const { Op } = require('sequelize');
const http = require('http');
const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const {
  upsertStock,
  isStockDomainError,
  STOCK_DOMAIN_ERROR,
} = require('../shared/catalog/stock-write');
const {
  startSyncWorker,
  stopSyncWorker,
  ACTIVE_SYNC_JOB_STATUSES,
  updateJob,
  getJob,
} = require('../shared/integration-sync');

const smokeTenant = resolveSmokeTenant();
const TENANT_ID = smokeTenant.tenantId;
const TENANT_DOMAIN = smokeTenant.tenantDomain;
const RUN_ID = Date.now();
const PRODUCT_PREFIX = `p64-${RUN_ID}`;

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

async function waitForJobStatus(models, jobId, status, timeoutMs = 120000) {
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

async function waitForCondition(checkFn, timeoutMs = 120000) {
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

async function validateStockBusinessRules(models, productIdBas) {
  const created = await upsertStock(models, { productIdBas, quantity: 5 });
  record('business_rule_quantity_gt_zero', created.quantity === 5, `qty=${created.quantity}`);

  const zero = await upsertStock(models, { productIdBas, quantity: 0 });
  record('business_rule_quantity_zero', zero.quantity === 0, `qty=${zero.quantity}`);

  const productStillExists = await models.Product.findOne({ where: { id_bas: productIdBas } });
  record('business_rule_product_not_deleted', !!productStillExists);

  const inStock = zero.quantity > 0;
  record('business_rule_in_stock_false', inStock === false, `inStock=${inStock}`);

  try {
    await upsertStock(models, { productIdBas, quantity: -1 });
    record('business_rule_negative_quantity', false, 'expected INVALID_QUANTITY');
  } catch (error) {
    record(
      'business_rule_negative_quantity',
      isStockDomainError(error) && error.code === STOCK_DOMAIN_ERROR.INVALID_QUANTITY,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await upsertStock(models, {
      productIdBas: '00000000-0000-0000-0000-000000000099',
      quantity: 1,
    });
    record('business_rule_product_missing', false, 'expected PRODUCT_NOT_FOUND');
  } catch (error) {
    record(
      'business_rule_product_missing',
      isStockDomainError(error) && error.code === STOCK_DOMAIN_ERROR.PRODUCT_NOT_FOUND,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function main() {
  console.log('\n=== Platform-6.4 Bulk Product + Price + Stock Sync Smoke ===\n');

  const tenant = smokeTenant.tenant;
  console.log(`[smoke] tenant=${TENANT_ID} domain=${smokeTenant.tenantDomain} source=${smokeTenant.source}`);

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
    label: 'Platform-6.4 full catalog sync smoke',
    scopes: ['sync.read', 'sync.write', 'catalog.read', 'catalog.write', 'prices.write', 'stock.write'],
    createdBy: 'integration-sync-stock-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  startSyncWorker({ intervalMs: 400 });

  const productIds = [];

  try {
    const createJob = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: `p64-job-${RUN_ID}`,
      body: {
        jobType: 'full_catalog',
        syncMode: 'full',
        clientReference: `p64-smoke-${RUN_ID}`,
        phases: ['products', 'prices', 'stock'],
        expectedCounts: { products: 30, prices: 30, stock: 30 },
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
          records: [{ productIdBas: 'x', quantity: 1 }],
        },
      },
    );
    record(
      'unsupported_phase',
      unsupported.status === 400 && unsupported.body?.code === 'UNSUPPORTED_PHASE',
      `status=${unsupported.status}`,
    );

    const oversized = Array.from({ length: 501 }, (_, i) => ({
      productIdBas: `${PRODUCT_PREFIX}-big-${i}`,
      quantity: 1,
    }));
    const tooBig = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'stock',
          batchIndex: 99,
          expectedBatches: 3,
          records: oversized,
        },
      },
    );
    record(
      'chunk_limit_stock',
      tooBig.status === 400 && tooBig.body?.code === 'CHUNK_SIZE_LIMIT_EXCEEDED',
      `status=${tooBig.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const idBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        productIds.push(idBas);
        return {
          idBas,
          name: `Platform 6.4 Product ${batchIndex}-${i}`,
          categoryIdBas,
        };
      });

      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        {
          apiKey,
          body: { phase: 'products', batchIndex, expectedBatches: 3, records },
        },
      );
      record(`upload_product_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const productIdBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        return {
          productIdBas,
          price: 1000 + batchIndex * 100 + i,
        };
      });

      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        {
          apiKey,
          body: { phase: 'prices', batchIndex, expectedBatches: 3, records },
        },
      );
      record(`upload_price_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    await waitForCondition(async () => {
      const jobRes = await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}`, 'GET', {
        apiKey,
      });
      const products = jobRes.body?.data?.phaseUploadProgress?.products;
      const prices = jobRes.body?.data?.phaseUploadProgress?.prices;
      if (products?.uploaded === 3 && prices?.uploaded === 3) {
        return jobRes;
      }
      return null;
    });

    const beforeStock = await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}`, 'GET', {
      apiKey,
    });
    record(
      'job_not_completed_before_stock',
      beforeStock.body?.data?.status !== 'completed',
      `status=${beforeStock.body?.data?.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const productIdBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        const quantity = batchIndex === 0 && i === 0 ? 0 : 10 + batchIndex + i;
        return { productIdBas, quantity };
      });

      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        {
          apiKey,
          body: { phase: 'stock', batchIndex, expectedBatches: 3, records },
        },
      );
      record(`upload_stock_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    const dup = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'stock',
          batchIndex: 0,
          expectedBatches: 3,
          records: [{ productIdBas: productIds[0], quantity: 1 }],
        },
      },
    );
    record(
      'duplicate_stock_batch',
      dup.status === 409 && dup.body?.code === 'DUPLICATE_BATCH',
      `status=${dup.status}`,
    );

    const progressMid = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}`,
      'GET',
      { apiKey },
    );
    const pp = progressMid.body?.data?.phaseUploadProgress;
    record(
      'phase_progress_all',
      pp?.products?.uploaded === 3 &&
        pp?.prices?.uploaded === 3 &&
        pp?.stock?.expected === 3 &&
        pp?.stock?.uploaded === 3,
      JSON.stringify(pp),
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

    await waitForJobStatus(models, jobId, 'completed');
    record('job_completion', true);

    const finalJob = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}`,
      'GET',
      { apiKey },
    );
    record(
      'metrics',
      finalJob.body?.data?.processedRecords === 90 &&
        finalJob.body?.data?.createdCount >= 30,
      `processed=${finalJob.body?.data?.processedRecords} created=${finalJob.body?.data?.createdCount}`,
    );

    const finalPp = finalJob.body?.data?.phaseUploadProgress;
    record(
      'phase_completed_all',
      finalPp?.products?.completed === 3 &&
        finalPp?.prices?.completed === 3 &&
        finalPp?.stock?.completed === 3,
      JSON.stringify(finalPp),
    );

    const dbProductCount = await models.Product.count({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_products', dbProductCount === 30, `count=${dbProductCount}`);

    const dbPriceCount = await models.Products_price.count({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_prices', dbPriceCount === 30, `count=${dbPriceCount}`);

    const dbStockCount = await models.Products_quantity.count({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_stock', dbStockCount === 30, `count=${dbStockCount}`);

    const zeroStockRow = await models.Products_quantity.findOne({
      where: { id_bas_product: productIds[0] },
    });
    record(
      'db_quantity_zero',
      zeroStockRow?.quantity === 0,
      `qty=${zeroStockRow?.quantity}`,
    );

    const eventsRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/events`,
      'GET',
      { apiKey },
    );
    const events = eventsRes.body?.data?.events || [];
    const stockEvents = events.filter((e) => e.phase === 'stock');
    record(
      'events',
      stockEvents.some((e) => e.eventType === 'batch.uploaded') &&
        stockEvents.some((e) => e.eventType === 'phase.completed'),
      `stockEvents=${stockEvents.length}`,
    );

    await validateStockBusinessRules(models, productIds[1]);

    const putStock = await httpRequest(
      port,
      `/api/integration/v1/stock/${productIds[2]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p64-stock-put-${RUN_ID}`,
        body: { quantity: 42 },
      },
    );
    record('backward_compat_put_stock', putStock.status === 200, `status=${putStock.status}`);

    const putPrice = await httpRequest(
      port,
      `/api/integration/v1/prices/${productIds[2]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p64-price-put-${RUN_ID}`,
        body: { price: 8888 },
      },
    );
    record('backward_compat_put_price', putPrice.status === 200, `status=${putPrice.status}`);

    const putProduct = await httpRequest(
      port,
      `/api/integration/v1/products/${productIds[2]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p64-product-put-${RUN_ID}`,
        body: { name: 'Backward compat check', categoryIdBas },
      },
    );
    record('backward_compat_put_product', putProduct.status === 200, `status=${putProduct.status}`);

    await models.Products_quantity.destroy({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    await models.Products_price.destroy({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    await models.Product.destroy({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });

    console.log('\n=== ALL PLATFORM-6.4 CHECKS PASSED ===\n');
    console.log('READY_FOR_PLATFORM_6_5');
  } finally {
    stopSyncWorker();
    await revokeKey(models, keyRecord.id, 'platform-64-smoke cleanup');
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
