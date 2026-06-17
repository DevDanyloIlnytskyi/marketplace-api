/**
 * Platform-7.2 — Integration product multipart write smoke.
 */
require('dotenv').config();

const fs = require('fs');
const http = require('http');

const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findProductByIdBas } = require('../shared/catalog/product-repository');
const { TINY_PNG, multipartRequest } = require('./lib/multipart-http');

const smokeTenant = resolveSmokeTenant();
const PRODUCT_ID_BAS = `p72-product-mp-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tenant = smokeTenant.tenant;
  const models = getTenantModels(tenant);
  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category');
  }

  const { plaintext: apiKey, record } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-7.2 product multipart smoke',
    scopes: ['catalog.write'],
    createdBy: 'integration-products-write-multipart-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const routePath = `/api/integration/v1/products/${PRODUCT_ID_BAS}`;

  try {
    const response = await multipartRequest(port, routePath, 'PUT', {
      host: smokeTenant.tenantDomain,
      apiKey,
      idempotencyKey: `p72-product-${Date.now()}`,
      fields: {
        name: 'P72 multipart product',
        categoryIdBas: category.id_bas,
        description: 'uploaded via multipart',
        manufacturer: 'Smoke',
        actual: 'true',
      },
      files: [{
        field: 'main_photo',
        filename: 'product-main.png',
        contentType: 'image/png',
        buffer: TINY_PNG,
      }],
    });

    assert(response.status === 200, `status ${response.status}`);
    assert(response.body?.data?.created === true, 'created');

    const row = await findProductByIdBas(models, PRODUCT_ID_BAS);
    assert(row, 'product exists');
    const plain = row.get({ plain: true });
    assert(plain.main_photo && plain.main_photo.startsWith('products/'), `main_photo path ${plain.main_photo}`);

    await models.Product.destroy({ where: { id_bas: PRODUCT_ID_BAS } });
    console.log('integration-products-write-multipart smoke passed');
  } finally {
    await revokeKey(models, record.id);
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
