/**
 * Platform-5.6 — PUT /api/integration/v1/prices/:productIdBas smoke test.
 *
 * Usage (MySQL on test_bd + idempotency migration):
 *   node scripts/integration-prices-write-smoke.js
 */
require('dotenv').config();

const http = require('http');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findRecent } = require('../shared/integration/audit');
const { upsertPrice } = require('../shared/catalog/price-write');
const { findPriceByProductIdBas } = require('../shared/catalog/price-repository');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const IDEMPOTENCY_KEY = `p56-idem-${Date.now()}`;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {number} port
 * @param {string} path
 * @param {'PUT'|'GET'} method
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
    await upsertPrice(models, { productIdBas, price: 7777 }, { transaction });
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const row = await findPriceByProductIdBas(models, productIdBas);
  assert(row === null || row.get({ plain: true }).price !== 7777, 'rollback must not persist 7777');
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

  await models.Products_price.destroy({ where: { id_bas_product: productIdBas } });

  const { plaintext: writeKey, record: writeRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.6 prices write smoke',
    scopes: ['prices.write'],
    createdBy: 'integration-prices-write-smoke',
  });

  const { plaintext: readKey, record: readRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.6 prices read smoke',
    scopes: ['prices.read'],
    createdBy: 'integration-prices-write-smoke',
  });

  const { plaintext: catalogKey, record: catalogRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.6 catalog write smoke',
    scopes: ['catalog.write'],
    createdBy: 'integration-prices-write-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const path = `/api/integration/v1/prices/${productIdBas}`;
  const body = { price: 1500, actionPrice: 1200 };

  const auditSince = new Date();

  try {
    const readDenied = await httpRequest(port, path, 'PUT', {
      apiKey: readKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-read`,
      body,
    });
    console.log('prices.read scope status:', readDenied.status);
    assert(readDenied.status === 403, 'prices.read must return 403');

    const catalogDenied = await httpRequest(port, path, 'PUT', {
      apiKey: catalogKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-catalog`,
      body,
    });
    console.log('catalog.write scope status:', catalogDenied.status);
    assert(catalogDenied.status === 403, 'catalog.write must not grant prices.write');

    const created = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('create price status:', created.status);
    assert(created.status === 200, 'create must return 200');
    assert(created.body?.data?.created === true, 'created=true');
    assert(created.body?.data?.price === 1500, 'price in response');

    const updated = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-update`,
      body: { price: 1600 },
    });
    console.log('update price status:', updated.status);
    assert(updated.status === 200, 'update must return 200');
    assert(updated.body?.data?.created === false, 'created=false');

    const notFound = await httpRequest(
      port,
      '/api/integration/v1/prices/00000000-0000-0000-0000-000000000099',
      'PUT',
      {
        apiKey: writeKey,
        idempotencyKey: `${IDEMPOTENCY_KEY}-404`,
        body: { price: 100 },
      },
    );
    console.log('product not found status:', notFound.status);
    assert(notFound.status === 404, 'missing product 404');
    assert(notFound.body?.code === 'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_FOUND');

    const invalidPrice = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-invalid`,
      body: { price: 12.34 },
    });
    console.log('invalid price status:', invalidPrice.status);
    assert(invalidPrice.status === 400, 'decimal price 400');
    assert(invalidPrice.body?.code === 'INVALID_PRICE', 'INVALID_PRICE');

    const replay = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('replay status:', replay.status);
    assert(replay.status === 200, 'replay 200');
    assert(replay.headers['x-idempotent-replay'] === 'true', 'replay header');
    assert(replay.body?.data?.created === true, 'replay same created flag');

    const conflict = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { price: 9999 },
    });
    console.log('conflict status:', conflict.status);
    assert(conflict.status === 409, 'conflict 409');
    assert(conflict.body?.code === 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT');

    await verifyTransactionRollback(models, sequelize, productIdBas);

    await sleep(200);
    const auditRows = await findRecent(models, {
      tenantId: tenant.id,
      since: auditSince,
      limit: 25,
    });
    const paths = auditRows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      return {
        path: plain.path,
        status: plain.status_code,
        success: plain.success,
        errorCode: plain.error_code,
      };
    });
    console.log('audit rows:', paths.length);
    assert(paths.length >= 4, 'audit rows created');
    assert(paths.some((entry) => entry.success && entry.status === 200), 'audit success');
    assert(paths.some((entry) => entry.status === 403), 'audit scope denial');
    assert(paths.some((entry) => entry.errorCode === 'INVALID_PRICE'), 'audit validation');
    assert(paths.some((entry) => entry.errorCode === 'IDEMPOTENCY_CONFLICT'), 'audit idempotency');

    console.log('integration prices write smoke passed');
  } finally {
    await revokeKey(models, writeRecord.id, 'integration-prices-write-smoke cleanup');
    await revokeKey(models, readRecord.id, 'integration-prices-write-smoke cleanup');
    await revokeKey(models, catalogRecord.id, 'integration-prices-write-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
