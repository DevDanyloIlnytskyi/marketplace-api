/**
 * Platform-5.7 — PUT /api/integration/v1/stock/:productIdBas smoke test.
 *
 * Usage (MySQL on test_bd + idempotency migration):
 *   node scripts/integration-stock-write-smoke.js
 */
require('dotenv').config();

const http = require('http');
const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findRecent } = require('../shared/integration/audit');
const { upsertStock } = require('../shared/catalog/stock-write');
const { findStockByProductIdBas } = require('../shared/catalog/stock-repository');

const smokeTenant = resolveSmokeTenant();
const TENANT_ID = smokeTenant.tenantId;
const TENANT_DOMAIN = smokeTenant.tenantDomain;
const IDEMPOTENCY_KEY = `p57-idem-${Date.now()}`;

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
    await upsertStock(models, { productIdBas, quantity: 8888 }, { transaction });
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const row = await findStockByProductIdBas(models, productIdBas);
  const quantity = row ? row.get({ plain: true }).quantity : null;
  assert(quantity !== 8888, 'rollback must not persist quantity 8888');
  console.log('transaction rollback (domain): ok');
}

async function main() {
  const tenant = smokeTenant.tenant;
  console.log(`[smoke] tenant=${TENANT_ID} domain=${smokeTenant.tenantDomain} source=${smokeTenant.source}`);

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);

  const product = await models.Product.findOne({ order: [['id', 'ASC']] });
  if (!product) {
    throw new Error('No product in tenant DB');
  }
  const productIdBas = product.id_bas;

  await models.Products_quantity.destroy({ where: { id_bas_product: productIdBas } });

  const { plaintext: writeKey, record: writeRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.7 stock write smoke',
    scopes: ['stock.write'],
    createdBy: 'integration-stock-write-smoke',
  });

  const { plaintext: readKey, record: readRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.7 stock read smoke',
    scopes: ['stock.read'],
    createdBy: 'integration-stock-write-smoke',
  });

  const { plaintext: catalogKey, record: catalogRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.7 catalog write smoke',
    scopes: ['catalog.write'],
    createdBy: 'integration-stock-write-smoke',
  });

  const { plaintext: pricesKey, record: pricesRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.7 prices write smoke',
    scopes: ['prices.write'],
    createdBy: 'integration-stock-write-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const path = `/api/integration/v1/stock/${productIdBas}`;
  const body = { quantity: 15 };

  const auditSince = new Date();

  try {
    const readDenied = await httpRequest(port, path, 'PUT', {
      apiKey: readKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-read`,
      body,
    });
    console.log('stock.read scope status:', readDenied.status);
    assert(readDenied.status === 403, 'stock.read must return 403');

    const catalogDenied = await httpRequest(port, path, 'PUT', {
      apiKey: catalogKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-catalog`,
      body,
    });
    console.log('catalog.write scope status:', catalogDenied.status);
    assert(catalogDenied.status === 403, 'catalog.write must not grant stock.write');

    const pricesDenied = await httpRequest(port, path, 'PUT', {
      apiKey: pricesKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-prices`,
      body,
    });
    console.log('prices.write scope status:', pricesDenied.status);
    assert(pricesDenied.status === 403, 'prices.write must not grant stock.write');

    const created = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('create stock status:', created.status);
    assert(created.status === 200, 'create must return 200');
    assert(created.body?.data?.created === true, 'created=true');
    assert(created.body?.data?.quantity === 15, 'quantity in response');

    const updated = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-update`,
      body: { quantity: 20 },
    });
    console.log('update stock status:', updated.status);
    assert(updated.status === 200, 'update must return 200');
    assert(updated.body?.data?.created === false, 'created=false');

    const notFound = await httpRequest(
      port,
      '/api/integration/v1/stock/00000000-0000-0000-0000-000000000099',
      'PUT',
      {
        apiKey: writeKey,
        idempotencyKey: `${IDEMPOTENCY_KEY}-404`,
        body: { quantity: 10 },
      },
    );
    console.log('product not found status:', notFound.status);
    assert(notFound.status === 404, 'missing product 404');
    assert(notFound.body?.code === 'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_FOUND');

    const invalidQty = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-invalid`,
      body: { quantity: -5 },
    });
    console.log('invalid quantity status:', invalidQty.status);
    assert(invalidQty.status === 400, 'negative quantity 400');
    assert(invalidQty.body?.code === 'INVALID_QUANTITY', 'INVALID_QUANTITY');

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
      body: { quantity: 999 },
    });
    console.log('conflict status:', conflict.status);
    assert(conflict.status === 409, 'conflict 409');
    assert(conflict.body?.code === 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT');

    await verifyTransactionRollback(models, sequelize, productIdBas);

    await sleep(200);
    const auditRows = await findRecent(models, {
      tenantId: tenant.id,
      since: auditSince,
      limit: 30,
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
    assert(paths.length >= 5, 'audit rows created');
    assert(paths.some((entry) => entry.success && entry.status === 200), 'audit success');
    assert(paths.some((entry) => entry.status === 403), 'audit scope denial');
    assert(paths.some((entry) => entry.errorCode === 'INVALID_QUANTITY'), 'audit validation');
    assert(paths.some((entry) => entry.errorCode === 'PRODUCT_NOT_FOUND'), 'audit product not found');
    assert(paths.some((entry) => entry.errorCode === 'IDEMPOTENCY_CONFLICT'), 'audit idempotency');

    console.log('integration stock write smoke passed');
  } finally {
    await revokeKey(models, writeRecord.id, 'integration-stock-write-smoke cleanup');
    await revokeKey(models, readRecord.id, 'integration-stock-write-smoke cleanup');
    await revokeKey(models, catalogRecord.id, 'integration-stock-write-smoke cleanup');
    await revokeKey(models, pricesRecord.id, 'integration-stock-write-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
