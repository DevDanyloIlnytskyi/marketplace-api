/**
 * Platform-5.9 — Integration End-to-End Validation on live test_bd.
 *
 * Usage:
 *   npm run integration-e2e:validate
 *
 * Requires: MySQL test_bd, idempotency migration, valid .env credentials.
 */
require('dotenv').config();
process.env.INTEGRATION_IDEMPOTENCY_ENABLED = 'true';

const http = require('http');
const fs = require('fs');
const path = require('path');

const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { getTenantStoragePath } = require('../shared/storage/paths');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findRecent } = require('../shared/integration/audit');
const { buildProductGalleryPaths } = require('../shared/product/gallery-paths');

const smokeTenant = resolveSmokeTenant();
const TENANT_ID = smokeTenant.tenantId;
const TENANT_DOMAIN = smokeTenant.tenantDomain;
const RUN_ID = Date.now();
const NEW_PRODUCT_ID_BAS = `p59-e2e-new-${RUN_ID}`;

/** @type {Record<string, { status: 'PASS' | 'FAIL' | 'SKIP', detail?: string }>} */
const results = {};

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function record(name, status, detail = '') {
  results[name] = { status, detail };
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  console.log(`${icon} ${name}${detail ? `: ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * @param {number} port
 * @param {string} urlPath
 * @param {'PUT'|'GET'} method
 * @param {{ apiKey: string, idempotencyKey?: string, body?: object }} options
 */
function httpRequest(port, urlPath, method, options) {
  const payload = options.body !== undefined ? JSON.stringify(options.body) : '';
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
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
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers,
      },
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
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
          });
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

async function sqlSnapshot(models, productIdBas) {
  const product = await models.Product.findOne({
    where: { id_bas: productIdBas },
    raw: true,
  });
  const price = await models.Products_price.findOne({
    where: { id_bas_product: productIdBas },
    raw: true,
  });
  const quantity = await models.Products_quantity.findOne({
    where: { id_bas_product: productIdBas },
    raw: true,
  });
  const photos = await models.Products_photo.findAll({
    where: { id_bas_product: productIdBas },
    order: [['id', 'ASC']],
    raw: true,
  });
  return { product, price, quantity, photos };
}

function printSql(label, snapshot) {
  console.log(`\n--- SQL ${label} ---`);
  console.log(
    JSON.stringify(
      {
        products: snapshot.product
          ? {
              id_bas: snapshot.product.id_bas,
              name: snapshot.product.name,
              main_photo: snapshot.product.main_photo,
            }
          : null,
        products_price: snapshot.price,
        products_quantity: snapshot.quantity,
        products_photos: snapshot.photos,
      },
      null,
      2,
    ),
  );
}

async function testIdempotencyTriplet(port, urlPath, writeKey, body) {
  const key = `p59-idem-${RUN_ID}-${urlPath.replace(/\W/g, '-')}`;
  const first = await httpRequest(port, urlPath, 'PUT', {
    apiKey: writeKey,
    idempotencyKey: key,
    body,
  });
  assert(first.status === 200, `idem #1 expected 200 got ${first.status}`);

  const second = await httpRequest(port, urlPath, 'PUT', {
    apiKey: writeKey,
    idempotencyKey: key,
    body,
  });
  assert(second.status === 200, `idem #2 expected 200 got ${second.status}`);
  assert(second.headers['x-idempotent-replay'] === 'true', 'idem #2 replay header');

  const third = await httpRequest(port, urlPath, 'PUT', {
    apiKey: writeKey,
    idempotencyKey: key,
    body: { ...body, _mutation: RUN_ID },
  });
  assert(third.status === 409, `idem #3 expected 409 got ${third.status}`);
  assert(third.body?.code === 'IDEMPOTENCY_CONFLICT', 'idem #3 conflict code');

  const idemRows = await getTenantModels(smokeTenant.tenant)
    .IntegrationIdempotencyKey.findAll({
      where: { idempotency_key: key },
      raw: true,
    });
  assert(idemRows.length >= 1, 'idempotency row persisted');
}

async function main() {
  console.log('\n=== Platform-5.9 Integration E2E Validation ===\n');

  const tenant = smokeTenant.tenant;
  console.log(`[smoke] tenant=${TENANT_ID} domain=${smokeTenant.tenantDomain} source=${smokeTenant.source}`);

  const storageRoot = getTenantStoragePath(tenant);
  console.log('INTEGRATION_TEST_ENVIRONMENT');
  console.log(
    JSON.stringify(
      {
        tenantId: tenant.id,
        domain: tenant.domain,
        database: tenant.database,
        storage: tenant.storage,
        storagePath: storageRoot,
        dbHost: process.env.host,
        dbPort: process.env.db_port,
        dbUser: process.env.user,
      },
      null,
      2,
    ),
  );

  let models;
  let sequelize;
  try {
    models = getTenantModels(tenant);
    sequelize = getTenantConnection(tenant);
    await sequelize.authenticate();
    record('db_connectivity', 'PASS', `${tenant.database}@${process.env.host}:${process.env.db_port}`);
  } catch (error) {
    record('db_connectivity', 'FAIL', error.message);
    console.error('\nBLOCKERS: Cannot connect to test_bd. Fix .env (db_port/credentials) and re-run.');
    process.exit(1);
  }

  const existing = await models.Product.findOne({ order: [['id', 'ASC']] });
  assert(existing, 'No products in test_bd');
  const existingPlain = existing.get({ plain: true });

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  assert(category, 'No categories in test_bd');
  const categoryIdBas = category.id_bas;

  console.log('\nTEST_PRODUCT_MATRIX');
  console.log(
    JSON.stringify(
      {
        existingProduct: { idBas: existingPlain.id_bas, name: existingPlain.name },
        newProduct: { idBas: NEW_PRODUCT_ID_BAS },
      },
      null,
      2,
    ),
  );

  const keys = {};
  const keyRecords = [];
  for (const scope of ['catalog.write', 'prices.write', 'stock.write', 'media.write', 'catalog.read']) {
    const created = await createKey(models, {
      tenantId: tenant.id,
      label: `Platform-5.9 E2E ${scope}`,
      scopes: [scope],
      createdBy: 'integration-platform-59-e2e',
    });
    keys[scope] = created.plaintext;
    keyRecords.push(created.record);
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const auditSince = new Date();

  try {
    // --- Product ---
    const beforeCreate = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    printSql('BEFORE create product', beforeCreate);

    const createProduct = await httpRequest(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['catalog.write'],
        idempotencyKey: `p59-prod-create-${RUN_ID}`,
        body: {
          name: 'Platform 5.9 E2E Product',
          categoryIdBas,
          mainPhoto: 'products/p59-main.webp',
        },
      },
    );
    assert(createProduct.status === 200 && createProduct.body?.data?.created === true, 'create product');
    const afterCreate = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    printSql('AFTER create product', afterCreate);
    assert(afterCreate.product?.name === 'Platform 5.9 E2E Product', 'product row inserted');
    record('product_create', 'PASS');

    const updateProduct = await httpRequest(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['catalog.write'],
        idempotencyKey: `p59-prod-update-${RUN_ID}`,
        body: { name: 'Platform 5.9 E2E Updated', categoryIdBas },
      },
    );
    assert(updateProduct.status === 200 && updateProduct.body?.data?.created === false, 'update product');
    const afterUpdate = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(afterUpdate.product?.name === 'Platform 5.9 E2E Updated', 'product row updated');
    assert(afterUpdate.product?.main_photo === 'products/p59-main.webp', 'main_photo preserved');
    record('product_update', 'PASS');
    record('product_main_photo_preservation', 'PASS');

    const badCategory = await httpRequest(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}-rollback`,
      'PUT',
      {
        apiKey: keys['catalog.write'],
        idempotencyKey: `p59-prod-rollback-${RUN_ID}`,
        body: {
          name: 'Rollback Test',
          categoryIdBas: '00000000-0000-0000-0000-000000000099',
        },
      },
    );
    assert(badCategory.status === 404, 'rollback trigger 404');
    const rollbackCheck = await models.Product.findOne({
      where: { id_bas: `${NEW_PRODUCT_ID_BAS}-rollback` },
    });
    assert(!rollbackCheck, 'transaction rollback — no orphan product');
    record('product_transaction_rollback', 'PASS');

    await testIdempotencyTriplet(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}`,
      keys['catalog.write'],
      { name: 'Idem Product', categoryIdBas },
    );
    record('product_idempotency', 'PASS');

    const scopeDenied = await httpRequest(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['catalog.read'],
        idempotencyKey: `p59-prod-scope-${RUN_ID}`,
        body: { name: 'X', categoryIdBas },
      },
    );
    assert(scopeDenied.status === 403, 'product scope 403');
    record('product_scope_denial', 'PASS');

    // --- Price ---
    const priceCreate = await httpRequest(
      port,
      `/api/integration/v1/prices/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['prices.write'],
        idempotencyKey: `p59-price-create-${RUN_ID}`,
        body: { price: 1500, actionPrice: 1200 },
      },
    );
    assert(priceCreate.status === 200, 'price create');
    let priceSnap = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(priceSnap.price?.price === 1500, 'products_price inserted');
    record('price_create', 'PASS');

    const priceZero = await httpRequest(
      port,
      `/api/integration/v1/prices/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['prices.write'],
        idempotencyKey: `p59-price-zero-${RUN_ID}`,
        body: { price: 0 },
      },
    );
    assert(priceZero.status === 200, 'price zero');
    priceSnap = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(priceSnap.price?.price === 0, 'price=0 stored');
    record('price_zero', 'PASS');

    const invalidPrice = await httpRequest(
      port,
      `/api/integration/v1/prices/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['prices.write'],
        idempotencyKey: `p59-price-invalid-${RUN_ID}`,
        body: { price: -10 },
      },
    );
    assert(invalidPrice.status === 400 && invalidPrice.body?.code === 'INVALID_PRICE', 'invalid price');
    record('price_invalid', 'PASS');

    await testIdempotencyTriplet(
      port,
      `/api/integration/v1/prices/${NEW_PRODUCT_ID_BAS}`,
      keys['prices.write'],
      { price: 1600 },
    );
    record('price_idempotency', 'PASS');

    // --- Stock ---
    const stockCreate = await httpRequest(
      port,
      `/api/integration/v1/stock/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['stock.write'],
        idempotencyKey: `p59-stock-create-${RUN_ID}`,
        body: { quantity: 25 },
      },
    );
    assert(stockCreate.status === 200, 'stock create');
    let stockSnap = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(stockSnap.quantity?.quantity === 25, 'products_quantity inserted');
    record('stock_create', 'PASS');

    const stockZero = await httpRequest(
      port,
      `/api/integration/v1/stock/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['stock.write'],
        idempotencyKey: `p59-stock-zero-${RUN_ID}`,
        body: { quantity: 0 },
      },
    );
    assert(stockZero.status === 200, 'stock zero');
    stockSnap = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(stockSnap.quantity?.quantity === 0, 'quantity=0 stored');
    record('stock_zero', 'PASS');

    const negStock = await httpRequest(
      port,
      `/api/integration/v1/stock/${NEW_PRODUCT_ID_BAS}`,
      'PUT',
      {
        apiKey: keys['stock.write'],
        idempotencyKey: `p59-stock-neg-${RUN_ID}`,
        body: { quantity: -5 },
      },
    );
    assert(negStock.status === 400 && negStock.body?.code === 'INVALID_QUANTITY', 'negative quantity');
    record('stock_negative', 'PASS');

    await testIdempotencyTriplet(
      port,
      `/api/integration/v1/stock/${NEW_PRODUCT_ID_BAS}`,
      keys['stock.write'],
      { quantity: 10 },
    );
    record('stock_idempotency', 'PASS');

    // --- Media ---
    const mediaSync = await httpRequest(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}/media`,
      'PUT',
      {
        apiKey: keys['media.write'],
        idempotencyKey: `p59-media-sync-${RUN_ID}`,
        body: {
          photos: ['products/p59-a.webp', 'products/p59-b.webp', 'products/p59-c.webp'],
        },
      },
    );
    assert(mediaSync.status === 200, 'media sync');
    let mediaSnap = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(mediaSnap.product?.main_photo === 'products/p59-a.webp', 'main_photo synced');
    assert(mediaSnap.photos.length === 2, 'two gallery rows');
    const galleryPaths = buildProductGalleryPaths(
      mediaSnap.product?.main_photo,
      mediaSnap.photos,
    );
    assert(galleryPaths.length === 3, 'replacePhotoSet gallery view');
    record('media_replace_photo_set', 'PASS');

    const mediaDup = await httpRequest(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}/media`,
      'PUT',
      {
        apiKey: keys['media.write'],
        idempotencyKey: `p59-media-dup-${RUN_ID}`,
        body: { photos: ['products/x.webp', 'products/x.webp'] },
      },
    );
    assert(mediaDup.status === 400 && mediaDup.body?.code === 'DUPLICATE_PHOTO', 'duplicate photo');
    record('media_duplicate', 'PASS');

    await testIdempotencyTriplet(
      port,
      `/api/integration/v1/products/${NEW_PRODUCT_ID_BAS}/media`,
      keys['media.write'],
      { photos: ['products/p59-a.webp'] },
    );
    record('media_idempotency', 'PASS');

    // --- Concurrency ---
    const concurrentKey = `p59-concurrent-${RUN_ID}`;
    const concurrentBody = { quantity: 42 };
    const [c1, c2] = await Promise.all([
      httpRequest(port, `/api/integration/v1/stock/${NEW_PRODUCT_ID_BAS}`, 'PUT', {
        apiKey: keys['stock.write'],
        idempotencyKey: concurrentKey,
        body: concurrentBody,
      }),
      httpRequest(port, `/api/integration/v1/stock/${NEW_PRODUCT_ID_BAS}`, 'PUT', {
        apiKey: keys['stock.write'],
        idempotencyKey: concurrentKey,
        body: concurrentBody,
      }),
    ]);
    assert(c1.status === 200 && c2.status === 200, 'concurrent both 200');
    const replayCount = [c1, c2].filter((r) => r.headers['x-idempotent-replay'] === 'true').length;
    assert(replayCount >= 1, 'at least one replay');
    assert(
      c1.body?.data?.quantity === c2.body?.data?.quantity,
      'concurrent same response body',
    );
    stockSnap = await sqlSnapshot(models, NEW_PRODUCT_ID_BAS);
    assert(stockSnap.quantity?.quantity === 42, 'single execution result');
    record('concurrency_same_idempotency_key', 'PASS');

    // --- OpenAPI contract spot checks ---
    assert(createProduct.body?.success === true, 'openapi success envelope');
    assert(typeof createProduct.body?.requestId === 'string', 'openapi requestId');
    assert(typeof createProduct.body?.data?.idBas === 'string', 'openapi product data.idBas');
    assert(typeof priceCreate.body?.data?.price === 'number', 'openapi price data.price');
    assert(typeof stockCreate.body?.data?.quantity === 'number', 'openapi stock data.quantity');
    assert(Array.isArray(mediaSync.body?.data?.photos), 'openapi media data.photos');
    record('openapi_contract_spot_check', 'PASS');

    // --- Storage paths ---
    const storageExists = fs.existsSync(storageRoot);
    record('storage_root_exists', storageExists ? 'PASS' : 'SKIP', storageRoot);

    // --- Audit ---
    await sleep(300);
    const auditRows = await findRecent(models, { tenantId: tenant.id, since: auditSince, limit: 50 });
    const auditSummary = auditRows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        status: plain.status_code,
        success: plain.success,
        errorCode: plain.error_code,
        path: plain.path,
      };
    });
    console.log('\nAUDIT SAMPLE (last 10):');
    console.log(JSON.stringify(auditSummary.slice(0, 10), null, 2));
    assert(auditSummary.some((r) => r.success && r.status === 200), 'audit success');
    assert(auditSummary.some((r) => r.status === 403), 'audit scope denial');
    assert(auditSummary.some((r) => r.errorCode === 'INVALID_PRICE'), 'audit validation');
    assert(auditSummary.some((r) => r.errorCode === 'IDEMPOTENCY_CONFLICT'), 'audit idempotency');
    record('audit_logging', 'PASS');

    // Cleanup test product
    await models.Products_photo.destroy({ where: { id_bas_product: NEW_PRODUCT_ID_BAS } });
    await models.Products_price.destroy({ where: { id_bas_product: NEW_PRODUCT_ID_BAS } });
    await models.Products_quantity.destroy({ where: { id_bas_product: NEW_PRODUCT_ID_BAS } });
    await models.Product.destroy({ where: { id_bas: NEW_PRODUCT_ID_BAS } });

    console.log('\n=== ALL E2E CHECKS PASSED ===\n');
    console.log('GO_FOR_PLATFORM_6_0');
  } finally {
    for (const record of keyRecords) {
      await revokeKey(models, record.id, 'platform-59-e2e cleanup');
    }
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error('\nE2E VALIDATION FAILED:', error.message);
  console.error('\nBLOCKERS_FOR_PLATFORM_6_0');
  process.exit(1);
});
