/**
 * Platform-5.8 — PUT /api/integration/v1/products/:productIdBas/media smoke test.
 *
 * Usage (MySQL on test_bd + idempotency migration):
 *   node scripts/integration-media-write-smoke.js
 */
require('dotenv').config();

const http = require('http');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findRecent } = require('../shared/integration/audit');
const { replacePhotoSet } = require('../shared/catalog/media-write');
const { findProductByIdBas } = require('../shared/catalog/product-repository');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const IDEMPOTENCY_KEY = `p58-idem-${Date.now()}`;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {number} port
 * @param {string} path
 * @param {'PUT'} method
 * @param {{ apiKey: string, idempotencyKey?: string, body?: object }} options
 */
function httpRequest(port, path, method, options) {
  const payload = options.body ? JSON.stringify(options.body) : '';
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
        path,
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyTransactionRollback(models, sequelize, productIdBas) {
  const transaction = await sequelize.transaction();
  try {
    await replacePhotoSet(
      models,
      {
        productIdBas,
        photos: ['products/rollback-only.webp'],
      },
      { transaction },
    );
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const product = await findProductByIdBas(models, productIdBas);
  const plain = product.get({ plain: true });
  assert(plain.main_photo !== 'products/rollback-only.webp', 'rollback must not persist main');
  console.log('transaction rollback (domain): ok');
}

async function main() {
  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);

  const product = await models.Product.findOne({ order: [['id', 'ASC']] });
  if (!product) {
    throw new Error('No product in tenant DB');
  }
  const productIdBas = product.id_bas;

  await models.Products_photo.destroy({ where: { id_bas_product: productIdBas } });

  const { plaintext: writeKey, record: writeRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.8 media write smoke',
    scopes: ['media.write'],
    createdBy: 'integration-media-write-smoke',
  });

  const { plaintext: readKey, record: readRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.8 media read smoke',
    scopes: ['media.read'],
    createdBy: 'integration-media-write-smoke',
  });

  const { plaintext: catalogKey, record: catalogRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.8 catalog write smoke',
    scopes: ['catalog.write'],
    createdBy: 'integration-media-write-smoke',
  });

  const { plaintext: pricesKey, record: pricesRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.8 prices write smoke',
    scopes: ['prices.write'],
    createdBy: 'integration-media-write-smoke',
  });

  const { plaintext: stockKey, record: stockRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.8 stock write smoke',
    scopes: ['stock.write'],
    createdBy: 'integration-media-write-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const path = `/api/integration/v1/products/${productIdBas}/media`;
  const body = {
    photos: ['products/p58-a.webp', 'products/p58-b.webp'],
  };

  const auditSince = new Date();

  try {
    for (const [label, apiKey] of [
      ['media.read', readKey],
      ['catalog.write', catalogKey],
      ['prices.write', pricesKey],
      ['stock.write', stockKey],
    ]) {
      const denied = await httpRequest(port, path, 'PUT', {
        apiKey,
        idempotencyKey: `${IDEMPOTENCY_KEY}-${label}`,
        body,
      });
      console.log(`${label} scope status:`, denied.status);
      assert(denied.status === 403, `${label} must return 403`);
    }

    const created = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('replace photo set status:', created.status);
    assert(created.status === 200, 'sync must return 200');
    assert(created.body?.data?.mainPhoto === 'products/p58-a.webp', 'main photo set');
    assert(created.body?.data?.galleryCount === 1, 'one gallery row');

    const updated = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-update`,
      body: { photos: ['products/p58-a.webp'] },
    });
    console.log('replace (remove gallery) status:', updated.status);
    assert(updated.status === 200, 'update must return 200');
    assert(updated.body?.data?.galleryCount === 0, 'gallery cleared');

    const notFound = await httpRequest(
      port,
      '/api/integration/v1/products/00000000-0000-0000-0000-000000000099/media',
      'PUT',
      {
        apiKey: writeKey,
        idempotencyKey: `${IDEMPOTENCY_KEY}-404`,
        body: { photos: ['products/x.webp'] },
      },
    );
    assert(notFound.status === 404, 'product not found 404');
    assert(notFound.body?.code === 'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_FOUND');

    const duplicate = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-dup`,
      body: { photos: ['products/a.webp', 'products/a.webp'] },
    });
    assert(duplicate.status === 400, 'duplicate 400');
    assert(duplicate.body?.code === 'DUPLICATE_PHOTO', 'DUPLICATE_PHOTO');

    const invalid = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-invalid`,
      body: { photos: ['../etc/passwd'] },
    });
    assert(invalid.status === 400, 'invalid path 400');
    assert(invalid.body?.code === 'INVALID_PHOTO_PATH', 'INVALID_PHOTO_PATH');

    const replay = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    assert(replay.status === 200, 'replay 200');
    assert(replay.headers['x-idempotent-replay'] === 'true', 'replay header');

    const conflict = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { photos: ['products/other.webp'] },
    });
    assert(conflict.status === 409, 'conflict 409');
    assert(conflict.body?.code === 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT');

    await verifyTransactionRollback(models, sequelize, productIdBas);

    await sleep(200);
    const auditRows = await findRecent(models, {
      tenantId: tenant.id,
      since: auditSince,
      limit: 30,
    });
    const summaries = auditRows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        status: plain.status_code,
        success: plain.success,
        errorCode: plain.error_code,
      };
    });
    assert(summaries.some((entry) => entry.success && entry.status === 200), 'audit success');
    assert(summaries.some((entry) => entry.status === 403), 'audit scope denial');
    assert(summaries.some((entry) => entry.errorCode === 'DUPLICATE_PHOTO'), 'audit duplicate');
    assert(summaries.some((entry) => entry.errorCode === 'PRODUCT_NOT_FOUND'), 'audit not found');
    assert(summaries.some((entry) => entry.errorCode === 'IDEMPOTENCY_CONFLICT'), 'audit idempotency');

    console.log('integration media write smoke passed');
  } finally {
    await revokeKey(models, writeRecord.id, 'integration-media-write-smoke cleanup');
    await revokeKey(models, readRecord.id, 'integration-media-write-smoke cleanup');
    await revokeKey(models, catalogRecord.id, 'integration-media-write-smoke cleanup');
    await revokeKey(models, pricesRecord.id, 'integration-media-write-smoke cleanup');
    await revokeKey(models, stockRecord.id, 'integration-media-write-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
