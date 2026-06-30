/**
 * Platform-7.3 — direct Integration writes without Idempotency-Key (default).
 */
require('dotenv').config();
process.env.INTEGRATION_IDEMPOTENCY_ENABLED = 'false';

const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findProductByIdBas } = require('../shared/catalog/product-repository');
const { getTenantProductImagePath } = require('../shared/storage/paths');
const { TINY_PNG, multipartRequest, jsonRequest } = require('./lib/multipart-http');

const smokeTenant = resolveSmokeTenant();
const PRODUCT_ID_BAS = `p73-no-idem-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * @param {number} port
 * @param {string} routePath
 * @param {'PUT'} method
 * @param {{ apiKey: string, body?: object }} options
 */
function jsonPut(port, routePath, options) {
  return jsonRequest(port, routePath, 'PUT', {
    host: smokeTenant.tenantDomain,
    apiKey: options.apiKey,
    body: options.body,
  });
}

function countProductFiles(tenant) {
  const dir = getTenantProductImagePath(tenant);
  if (!fs.existsSync(dir)) {
    return 0;
  }
  return fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile()).length;
}

function assertPublicDocsClean() {
  const apiRoot = path.join(__dirname, '..');
  const docPath = path.join(apiRoot, 'docs', '1C_API_DOCUMENTATION.md');
  const postmanPath = path.join(apiRoot, 'docs', '1C_API_POSTMAN_COLLECTION_DRAFT.json');
  const forbidden = [
    'Idempotency-Key',
    'idempotencyKey',
    '/catalog/sync',
    'Bulk Sync',
    'sync.write',
    'sync.read',
  ];

  for (const filePath of [docPath, postmanPath]) {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const term of forbidden) {
      assert(!content.includes(term), `${path.basename(filePath)} must not contain "${term}"`);
    }
  }
}

async function main() {
  const tenant = smokeTenant.tenant;
  const models = getTenantModels(tenant);
  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category in tenant DB');
  }
  const categoryIdBas = category.id_bas;

  const { plaintext: writeKey, record: writeRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-7.3 no-idempotency smoke',
    scopes: ['catalog.write', 'media.write', 'prices.write', 'stock.write'],
    createdBy: 'integration-direct-write-no-idempotency-smoke',
  });

  const { plaintext: readKey, record: readRecord } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-7.3 read-only smoke',
    scopes: ['catalog.read'],
    createdBy: 'integration-direct-write-no-idempotency-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const productPath = `/api/integration/v1/products/${PRODUCT_ID_BAS}`;
  const mediaPath = `/api/integration/v1/products/${PRODUCT_ID_BAS}/media`;
  const pricePath = `/api/integration/v1/prices/${PRODUCT_ID_BAS}`;
  const stockPath = `/api/integration/v1/stock/${PRODUCT_ID_BAS}`;
  const productBody = {
    name: 'P73 no-idempotency product',
    categoryIdBas,
    manufacturer: 'Smoke',
    actual: true,
  };

  try {
    const forbidden = await jsonPut(port, productPath, {
      apiKey: readKey,
      body: productBody,
    });
    assert(forbidden.status === 403, 'catalog.read must return 403');
    assert(forbidden.body?.code === 'INSUFFICIENT_SCOPE', 'scope check still enforced');

    const productJson = await jsonPut(port, productPath, {
      apiKey: writeKey,
      body: productBody,
    });
    assert(productJson.status === 200, `product JSON status ${productJson.status}`);
    assert(productJson.body?.code !== 'IDEMPOTENCY_KEY_REQUIRED', 'must not require idempotency');
    assert(productJson.body?.data?.created === true, 'product created');

    const productMultipart = await multipartRequest(port, productPath, 'PUT', {
      host: smokeTenant.tenantDomain,
      apiKey: writeKey,
      fields: {
        name: 'P73 multipart product',
        categoryIdBas,
        actual: 'true',
      },
      files: [{
        field: 'main_photo',
        filename: 'main.png',
        contentType: 'image/png',
        buffer: TINY_PNG,
      }],
    });
    assert(productMultipart.status === 200, `product multipart status ${productMultipart.status}`);
    assert(productMultipart.body?.code !== 'IDEMPOTENCY_KEY_REQUIRED', 'multipart must not require idempotency');

    const row = await findProductByIdBas(models, PRODUCT_ID_BAS);
    assert(row?.get({ plain: true }).main_photo?.startsWith('products/'), 'multipart main_photo stored');

    const mediaMultipart = await multipartRequest(port, mediaPath, 'PUT', {
      host: smokeTenant.tenantDomain,
      apiKey: writeKey,
      fields: {},
      files: [
        {
          field: 'photos[]',
          filename: 'a.png',
          contentType: 'image/png',
          buffer: TINY_PNG,
        },
        {
          field: 'photos[]',
          filename: 'b.png',
          contentType: 'image/png',
          buffer: TINY_PNG,
        },
      ],
    });
    assert(mediaMultipart.status === 200, `media multipart status ${mediaMultipart.status}`);
    assert(mediaMultipart.body?.data?.galleryCount === 1, 'first photo is main, one gallery item');

    const price = await jsonPut(port, pricePath, {
      apiKey: writeKey,
      body: { price: 1500, actionPrice: 1200 },
    });
    assert(price.status === 200, `price status ${price.status}`);
    assert(price.body?.code !== 'IDEMPOTENCY_KEY_REQUIRED', 'price must not require idempotency');

    const stock = await jsonPut(port, stockPath, {
      apiKey: writeKey,
      body: { quantity: 7 },
    });
    assert(stock.status === 200, `stock status ${stock.status}`);
    assert(stock.body?.code !== 'IDEMPOTENCY_KEY_REQUIRED', 'stock must not require idempotency');

    const rollbackProductId = `${PRODUCT_ID_BAS}-rollback`;
    const beforeRollback = countProductFiles(tenant);
    const rollback = await multipartRequest(
      port,
      `/api/integration/v1/products/${rollbackProductId}`,
      'PUT',
      {
        host: smokeTenant.tenantDomain,
        apiKey: writeKey,
        fields: {
          name: 'Rollback candidate',
          categoryIdBas: '00000000-0000-0000-0000-000000000099',
          actual: 'true',
        },
        files: [{
          field: 'main_photo',
          filename: 'rollback.png',
          contentType: 'image/png',
          buffer: TINY_PNG,
        }],
      },
    );
    assert(rollback.status === 404, `rollback request status ${rollback.status}`);
    const afterRollback = countProductFiles(tenant);
    assert(afterRollback === beforeRollback, 'failed multipart must not leave orphan promoted files');

    assertPublicDocsClean();

    await models.Product.destroy({ where: { id_bas: PRODUCT_ID_BAS } });
    console.log('integration-direct-write-no-idempotency smoke passed');
  } finally {
    await revokeKey(models, writeRecord.id);
    await revokeKey(models, readRecord.id);
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
