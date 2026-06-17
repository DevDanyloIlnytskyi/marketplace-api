/**
 * Platform-7.2 — Integration multipart idempotency smoke tests.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findProductByIdBas } = require('../shared/catalog/product-repository');
const { getTenantProductImagePath } = require('../shared/storage/paths');
const { TINY_PNG, TINY_PNG_ALT, multipartRequest, jsonRequest } = require('./lib/multipart-http');

const smokeTenant = resolveSmokeTenant();
const PRODUCT_ID_BAS = `p72-idem-${Date.now()}`;
const IDEM_KEY = `p72-idem-key-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countProductFiles(tenant) {
  const dir = getTenantProductImagePath(tenant);
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile()).length;
}

async function main() {
  const tenant = smokeTenant.tenant;
  const models = getTenantModels(tenant);
  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category in tenant DB');
  }

  const { plaintext: apiKey, record: keyRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-7.2 multipart idempotency smoke',
    scopes: ['catalog.write', 'media.write'],
    createdBy: 'integration-idempotency-multipart-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const host = smokeTenant.tenantDomain;
  const productPath = `/api/integration/v1/products/${PRODUCT_ID_BAS}`;
  const categoryIdBas = category.id_bas;

  const filesBefore = countProductFiles(tenant);

  try {
    const fields = {
      name: 'P72 Multipart Idempotency',
      categoryIdBas,
      description: 'multipart smoke',
      actual: 'true',
    };
    const files = [{
      field: 'main_photo',
      filename: 'main.png',
      contentType: 'image/png',
      buffer: TINY_PNG,
    }];

    const created = await multipartRequest(port, productPath, 'PUT', {
      host,
      apiKey,
      idempotencyKey: IDEM_KEY,
      fields,
      files,
    });
    assert(created.status === 200, `create status ${created.status}`);
    assert(created.body?.data?.created === true, 'created=true');

    const filesAfterCreate = countProductFiles(tenant);
    assert(filesAfterCreate === filesBefore + 1, 'one promoted file on create');

    const replay = await multipartRequest(port, productPath, 'PUT', {
      host,
      apiKey,
      idempotencyKey: IDEM_KEY,
      fields,
      files,
    });
    assert(replay.status === 200, 'replay status 200');
    assert(replay.headers['x-idempotent-replay'] === 'true', 'replay header');
    const filesAfterReplay = countProductFiles(tenant);
    assert(filesAfterReplay === filesAfterCreate, 'replay must not add final storage files');

    const conflict = await multipartRequest(port, productPath, 'PUT', {
      host,
      apiKey,
      idempotencyKey: IDEM_KEY,
      fields: { ...fields, name: 'Different Name' },
      files,
    });
    assert(conflict.status === 409, 'hash mismatch 409');
    assert(conflict.body?.code === 'IDEMPOTENCY_CONFLICT', 'conflict code');
    assert(countProductFiles(tenant) === filesAfterCreate, 'conflict must not add files');

    const fileConflict = await multipartRequest(port, productPath, 'PUT', {
      host,
      apiKey,
      idempotencyKey: IDEM_KEY,
      fields,
      files: [{
        field: 'main_photo',
        filename: 'other.png',
        contentType: 'image/png',
        buffer: TINY_PNG_ALT,
      }],
    });
    assert(fileConflict.status === 409, 'different file conflict 409');
    assert(countProductFiles(tenant) === filesAfterCreate, 'file conflict must not add files');

    const badCategory = await multipartRequest(
      port,
      `/api/integration/v1/products/${PRODUCT_ID_BAS}-rollback`,
      'PUT',
      {
        host,
        apiKey,
        idempotencyKey: `${IDEM_KEY}-rollback`,
        fields: {
          name: 'Rollback test',
          categoryIdBas: '00000000-0000-0000-0000-000000000099',
        },
        files,
      },
    );
    assert(badCategory.status === 404, 'rollback path 404');
    const filesAfterRollback = countProductFiles(tenant);
    assert(filesAfterRollback === filesAfterCreate, 'failed write must rollback promoted files');

    const jsonCompat = await jsonRequest(port, productPath, 'PUT', {
      host,
      apiKey,
      idempotencyKey: `${IDEM_KEY}-json`,
      body: {
        name: 'P72 JSON compatibility',
        categoryIdBas,
      },
    });
    assert(jsonCompat.status === 200, 'json compatibility 200');

    await models.Product.destroy({ where: { id_bas: PRODUCT_ID_BAS } });
    console.log('integration-idempotency-multipart smoke passed');
  } finally {
    await revokeKey(models, keyRecord.id);
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
