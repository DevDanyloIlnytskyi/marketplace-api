/**
 * Platform-6.5 — full catalog bulk sync (products + prices + stock + media) on test_bd.
 *
 * Usage:
 *   npm run integration-sync-media:smoke
 */
require('dotenv').config();

const { Op } = require('sequelize');
const http = require('http');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const {
  replacePhotoSet,
  isMediaDomainError,
  MEDIA_DOMAIN_ERROR,
} = require('../shared/catalog/media-write');
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
const PRODUCT_PREFIX = `p65-${RUN_ID}`;

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

function photoPath(batchIndex, i, suffix = '0') {
  return `products/${PRODUCT_PREFIX}-b${batchIndex}-${i}-${suffix}.webp`;
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

async function waitForJobStatus(models, jobId, status, timeoutMs = 150000) {
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

async function validateMediaBusinessRules(models, productIdBas) {
  const withPhotos = await replacePhotoSet(models, {
    productIdBas,
    photos: [photoPath(9, 0, 'main'), photoPath(9, 0, 'gal')],
  });
  record(
    'business_rule_main_photo',
    withPhotos.mainPhoto === photoPath(9, 0, 'main'),
    withPhotos.mainPhoto,
  );
  record('business_rule_gallery', withPhotos.galleryCount === 1, `count=${withPhotos.galleryCount}`);

  const cleared = await replacePhotoSet(models, { productIdBas, photos: [] });
  record('business_rule_empty_photos', cleared.mainPhoto === null && cleared.galleryCount === 0);

  try {
    await replacePhotoSet(models, {
      productIdBas,
      photos: [photoPath(9, 1, 'a'), photoPath(9, 1, 'a')],
    });
    record('business_rule_duplicate_paths', false, 'expected DUPLICATE_PHOTO');
  } catch (error) {
    record(
      'business_rule_duplicate_paths',
      isMediaDomainError(error) && error.code === MEDIA_DOMAIN_ERROR.DUPLICATE_PHOTO,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await replacePhotoSet(models, {
      productIdBas: '00000000-0000-0000-0000-000000000099',
      photos: [photoPath(9, 2, 'x')],
    });
    record('business_rule_product_missing', false, 'expected PRODUCT_NOT_FOUND');
  } catch (error) {
    record(
      'business_rule_product_missing',
      isMediaDomainError(error) && error.code === MEDIA_DOMAIN_ERROR.PRODUCT_NOT_FOUND,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await replacePhotoSet(models, {
      productIdBas,
      photos: ['https://cdn.example.com/bad.webp'],
    });
    record('business_rule_invalid_path', false, 'expected INVALID_PHOTO_PATH');
  } catch (error) {
    record(
      'business_rule_invalid_path',
      isMediaDomainError(error) && error.code === MEDIA_DOMAIN_ERROR.INVALID_PHOTO_PATH,
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function main() {
  console.log('\n=== Platform-6.5 Bulk Full Catalog Sync Smoke ===\n');

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
    label: 'Platform-6.5 full catalog sync smoke',
    scopes: [
      'sync.read',
      'sync.write',
      'catalog.read',
      'catalog.write',
      'prices.write',
      'stock.write',
      'media.write',
    ],
    createdBy: 'integration-sync-media-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  startSyncWorker({ intervalMs: 400 });

  const productIds = [];

  try {
    const createJob = await httpRequest(port, '/api/integration/v1/catalog/sync', 'POST', {
      apiKey,
      idempotencyKey: `p65-job-${RUN_ID}`,
      body: {
        jobType: 'full_catalog',
        syncMode: 'full',
        clientReference: `p65-smoke-${RUN_ID}`,
        phases: ['products', 'prices', 'stock', 'media'],
        expectedCounts: { products: 30, prices: 30, stock: 30, media: 30 },
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
          records: [{ productIdBas: 'x', photos: [] }],
        },
      },
    );
    record(
      'unsupported_phase',
      unsupported.status === 400 && unsupported.body?.code === 'UNSUPPORTED_PHASE',
      `status=${unsupported.status}`,
    );

    const oversized = Array.from({ length: 51 }, (_, i) => ({
      productIdBas: `${PRODUCT_PREFIX}-big-${i}`,
      photos: [photoPath(99, i, '0')],
    }));
    const tooBig = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: { phase: 'media', batchIndex: 99, expectedBatches: 3, records: oversized },
      },
    );
    record(
      'chunk_limit_media',
      tooBig.status === 400 && tooBig.body?.code === 'CHUNK_SIZE_LIMIT_EXCEEDED',
      `status=${tooBig.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const idBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        productIds.push(idBas);
        return {
          idBas,
          name: `Platform 6.5 Product ${batchIndex}-${i}`,
          categoryIdBas,
        };
      });
      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        { apiKey, body: { phase: 'products', batchIndex, expectedBatches: 3, records } },
      );
      record(`upload_product_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => ({
        productIdBas: `${PRODUCT_PREFIX}-b${batchIndex}-${i}`,
        price: 1000 + batchIndex * 10 + i,
      }));
      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        { apiKey, body: { phase: 'prices', batchIndex, expectedBatches: 3, records } },
      );
      record(`upload_price_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => ({
        productIdBas: `${PRODUCT_PREFIX}-b${batchIndex}-${i}`,
        quantity: 5 + i,
      }));
      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        { apiKey, body: { phase: 'stock', batchIndex, expectedBatches: 3, records } },
      );
      record(`upload_stock_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    const beforeMedia = await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}`, 'GET', {
      apiKey,
    });
    record(
      'job_not_completed_before_media',
      beforeMedia.body?.data?.status !== 'completed',
      `status=${beforeMedia.body?.data?.status}`,
    );

    for (let batchIndex = 0; batchIndex < 3; batchIndex += 1) {
      const records = Array.from({ length: 10 }, (_, i) => {
        const productIdBas = `${PRODUCT_PREFIX}-b${batchIndex}-${i}`;
        if (batchIndex === 0 && i === 0) {
          return { productIdBas, photos: [] };
        }
        return {
          productIdBas,
          photos: [photoPath(batchIndex, i, '0'), photoPath(batchIndex, i, '1')],
        };
      });
      const upload = await httpRequest(
        port,
        `/api/integration/v1/catalog/sync/${jobId}/chunks`,
        'POST',
        { apiKey, body: { phase: 'media', batchIndex, expectedBatches: 3, records } },
      );
      record(`upload_media_chunk_${batchIndex}`, upload.status === 202, `status=${upload.status}`);
    }

    const dup = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/chunks`,
      'POST',
      {
        apiKey,
        body: {
          phase: 'media',
          batchIndex: 0,
          expectedBatches: 3,
          records: [{ productIdBas: productIds[1], photos: [photoPath(0, 1, '0')] }],
        },
      },
    );
    record(
      'duplicate_media_batch',
      dup.status === 409 && dup.body?.code === 'DUPLICATE_BATCH',
      `status=${dup.status}`,
    );

    const progressMid = await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}`, 'GET', {
      apiKey,
    });
    const pp = progressMid.body?.data?.phaseUploadProgress;
    record(
      'phase_progress_all',
      pp?.products?.uploaded === 3 &&
        pp?.prices?.uploaded === 3 &&
        pp?.stock?.uploaded === 3 &&
        pp?.media?.expected === 3 &&
        pp?.media?.uploaded === 3,
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

    const finalJob = await httpRequest(port, `/api/integration/v1/catalog/sync/${jobId}`, 'GET', {
      apiKey,
    });
    record(
      'metrics',
      finalJob.body?.data?.processedRecords === 120,
      `processed=${finalJob.body?.data?.processedRecords} updated=${finalJob.body?.data?.updatedCount}`,
    );

    const finalPp = finalJob.body?.data?.phaseUploadProgress;
    record(
      'phase_completed_all',
      finalPp?.products?.completed === 3 &&
        finalPp?.prices?.completed === 3 &&
        finalPp?.stock?.completed === 3 &&
        finalPp?.media?.completed === 3,
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

    const sampleProduct = await models.Product.findOne({
      where: { id_bas: productIds[1] },
    });
    record(
      'db_main_photo',
      sampleProduct?.main_photo === photoPath(0, 1, '0'),
      `main=${sampleProduct?.main_photo}`,
    );

    const galleryCount = await models.Products_photo.count({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    record('db_gallery_rows', galleryCount === 29, `count=${galleryCount}`);

    const clearedProduct = await models.Product.findOne({
      where: { id_bas: productIds[0] },
    });
    record(
      'db_empty_photos_product',
      clearedProduct?.main_photo === null || clearedProduct?.main_photo === '',
      `main=${clearedProduct?.main_photo}`,
    );

    const eventsRes = await httpRequest(
      port,
      `/api/integration/v1/catalog/sync/${jobId}/events`,
      'GET',
      { apiKey },
    );
    const mediaEvents = (eventsRes.body?.data?.events || []).filter((e) => e.phase === 'media');
    record(
      'events',
      mediaEvents.some((e) => e.eventType === 'batch.uploaded') &&
        mediaEvents.some((e) => e.eventType === 'phase.completed'),
      `mediaEvents=${mediaEvents.length}`,
    );

    await validateMediaBusinessRules(models, productIds[2]);

    const putMedia = await httpRequest(
      port,
      `/api/integration/v1/products/${productIds[2]}/media`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p65-media-put-${RUN_ID}`,
        body: { photos: [photoPath(8, 2, 'put')] },
      },
    );
    record('backward_compat_put_media', putMedia.status === 200, `status=${putMedia.status}`);

    const putStock = await httpRequest(
      port,
      `/api/integration/v1/stock/${productIds[2]}`,
      'PUT',
      { apiKey, idempotencyKey: `p65-stock-put-${RUN_ID}`, body: { quantity: 99 } },
    );
    record('backward_compat_put_stock', putStock.status === 200, `status=${putStock.status}`);

    const putPrice = await httpRequest(
      port,
      `/api/integration/v1/prices/${productIds[2]}`,
      'PUT',
      { apiKey, idempotencyKey: `p65-price-put-${RUN_ID}`, body: { price: 9999 } },
    );
    record('backward_compat_put_price', putPrice.status === 200, `status=${putPrice.status}`);

    const putProduct = await httpRequest(
      port,
      `/api/integration/v1/products/${productIds[2]}`,
      'PUT',
      {
        apiKey,
        idempotencyKey: `p65-product-put-${RUN_ID}`,
        body: { name: 'Backward compat check', categoryIdBas },
      },
    );
    record('backward_compat_put_product', putProduct.status === 200, `status=${putProduct.status}`);

    await models.Products_photo.destroy({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    await models.Products_quantity.destroy({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    await models.Products_price.destroy({
      where: { id_bas_product: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });
    await models.Product.destroy({
      where: { id_bas: { [Op.like]: `${PRODUCT_PREFIX}%` } },
    });

    console.log('\n=== ALL PLATFORM-6.5 CHECKS PASSED ===\n');
    console.log('READY_FOR_PLATFORM_6_6');
  } finally {
    stopSyncWorker();
    await revokeKey(models, keyRecord.id, 'platform-65-smoke cleanup');
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
