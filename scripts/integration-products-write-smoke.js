/**
 * Platform-5.5 — PUT /api/integration/v1/products/:idBas smoke test.
 *
 * Usage (MySQL on test_bd + idempotency migration):
 *   node scripts/integration-products-write-smoke.js
 */
require('dotenv').config();
process.env.INTEGRATION_IDEMPOTENCY_ENABLED = 'true';

const http = require('http');
const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findRecent } = require('../shared/integration/audit');
const { upsertProduct } = require('../shared/catalog/product-write');
const { findProductByIdBas } = require('../shared/catalog/product-repository');

const smokeTenant = resolveSmokeTenant();
const TENANT_ID = smokeTenant.tenantId;
const TENANT_DOMAIN = smokeTenant.tenantDomain;
const PRODUCT_ID_BAS = `p55-smoke-${Date.now()}`;
const IDEMPOTENCY_KEY = `p55-idem-${Date.now()}`;

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

async function verifyTransactionRollback(models, sequelize, categoryIdBas) {
  const rollbackIdBas = `${PRODUCT_ID_BAS}-rollback`;
  const transaction = await sequelize.transaction();
  try {
    await upsertProduct(
      models,
      {
        idBas: rollbackIdBas,
        name: 'Rollback Product',
        categoryIdBas,
      },
      { transaction },
    );
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const row = await findProductByIdBas(models, rollbackIdBas);
  assert(row === null, 'transaction rollback must not persist product');
  console.log('transaction rollback (domain): ok');
}

async function main() {
  const tenant = smokeTenant.tenant;
  console.log(`[smoke] tenant=${TENANT_ID} domain=${smokeTenant.tenantDomain} source=${smokeTenant.source}`);

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category in tenant DB');
  }
  const categoryIdBas = category.id_bas;

  const { plaintext: writeKey, record: writeRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.5 products write smoke',
    scopes: ['catalog.write'],
    createdBy: 'integration-products-write-smoke',
  });

  const { plaintext: readKey, record: readRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.5 products read-only smoke',
    scopes: ['catalog.read'],
    createdBy: 'integration-products-write-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const path = `/api/integration/v1/products/${PRODUCT_ID_BAS}`;
  const body = {
    name: 'Platform 5.5 Smoke Product',
    description: 'Integration write smoke',
    categoryIdBas,
    manufacturer: 'SmokeTest',
    actual: true,
  };

  const auditSince = new Date();

  try {
    const forbidden = await httpRequest(port, path, 'PUT', {
      apiKey: readKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-forbidden`,
      body,
    });
    console.log('catalog.read scope status:', forbidden.status);
    assert(forbidden.status === 403, 'catalog.read must return 403');
    assert(forbidden.body?.code === 'INSUFFICIENT_SCOPE', 'scope error code');

    const created = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('create status:', created.status);
    assert(created.status === 200, 'create must return 200');
    assert(created.body?.data?.created === true, 'create must set created=true');
    assert(created.body?.data?.idBas === PRODUCT_ID_BAS, 'idBas in response');

    const updated = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: `${IDEMPOTENCY_KEY}-update`,
      body: { ...body, name: 'Platform 5.5 Smoke Product Updated' },
    });
    console.log('update status:', updated.status);
    assert(updated.status === 200, 'update must return 200');
    assert(updated.body?.data?.created === false, 'update must set created=false');

    const badCategory = await httpRequest(
      port,
      `/api/integration/v1/products/${PRODUCT_ID_BAS}-bad-cat`,
      'PUT',
      {
        apiKey: writeKey,
        idempotencyKey: `${IDEMPOTENCY_KEY}-bad-cat`,
        body: {
          name: 'Bad Category Product',
          categoryIdBas: '00000000-0000-0000-0000-000000000099',
        },
      },
    );
    console.log('bad category status:', badCategory.status);
    assert(badCategory.status === 404, 'invalid category must return 404');
    assert(badCategory.body?.code === 'CATEGORY_NOT_FOUND', 'CATEGORY_NOT_FOUND code');

    const validation = await httpRequest(
      port,
      `/api/integration/v1/products/${PRODUCT_ID_BAS}-invalid`,
      'PUT',
      {
        apiKey: writeKey,
        idempotencyKey: `${IDEMPOTENCY_KEY}-validation`,
        body: { categoryIdBas },
      },
    );
    console.log('validation status:', validation.status);
    assert(validation.status === 400, 'missing name must return 400');
    assert(validation.body?.code === 'INVALID_PRODUCT_NAME', 'INVALID_PRODUCT_NAME code');

    const replay = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('replay status:', replay.status);
    console.log('replay header:', replay.headers['x-idempotent-replay']);
    assert(replay.status === 200, 'replay must return 200');
    assert(replay.headers['x-idempotent-replay'] === 'true', 'replay header');
    assert(
      replay.body?.data?.created === created.body?.data?.created,
      'replay same created flag',
    );

    const conflict = await httpRequest(port, path, 'PUT', {
      apiKey: writeKey,
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { ...body, name: 'Different Name For Conflict' },
    });
    console.log('conflict status:', conflict.status);
    assert(conflict.status === 409, 'hash mismatch must return 409');
    assert(conflict.body?.code === 'IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT code');

    await verifyTransactionRollback(models, sequelize, categoryIdBas);

    await sleep(200);
    const auditRows = await findRecent(models, {
      tenantId: tenant.id,
      since: auditSince,
      limit: 20,
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
    assert(paths.length >= 4, 'audit must log multiple requests');

    const successLog = paths.find((entry) => entry.success && entry.status === 200);
    const scopeLog = paths.find((entry) => entry.status === 403);
    const validationLog = paths.find((entry) => entry.errorCode === 'INVALID_PRODUCT_NAME');
    assert(successLog, 'audit must include success');
    assert(scopeLog, 'audit must include permission error');
    assert(validationLog, 'audit must include validation error');

    await models.Product.destroy({ where: { id_bas: PRODUCT_ID_BAS } });
    console.log('integration products write smoke passed');
  } finally {
    await revokeKey(models, writeRecord.id, 'integration-products-write-smoke cleanup');
    await revokeKey(models, readRecord.id, 'integration-products-write-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
