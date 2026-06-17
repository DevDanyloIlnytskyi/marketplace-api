/**
 * Platform-7.2 — Integration media multipart write smoke.
 */
require('dotenv').config();

const http = require('http');

const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findProductByIdBas } = require('../shared/catalog/product-repository');
const { TINY_PNG, TINY_PNG_ALT, multipartRequest } = require('./lib/multipart-http');

const smokeTenant = resolveSmokeTenant();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tenant = smokeTenant.tenant;
  const models = getTenantModels(tenant);
  const product = await models.Product.findOne({ order: [['id', 'ASC']] });
  if (!product) {
    throw new Error('No product');
  }
  const productIdBas = product.id_bas;

  await models.Products_photo.destroy({ where: { id_bas_product: productIdBas } });

  const { plaintext: apiKey, record } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-7.2 media multipart smoke',
    scopes: ['media.write'],
    createdBy: 'integration-media-write-multipart-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const routePath = `/api/integration/v1/products/${productIdBas}/media`;

  try {
    const response = await multipartRequest(port, routePath, 'PUT', {
      host: smokeTenant.tenantDomain,
      apiKey,
      idempotencyKey: `p72-media-${Date.now()}`,
      fields: {},
      files: [
        {
          field: 'photos',
          filename: 'a.png',
          contentType: 'image/png',
          buffer: TINY_PNG,
        },
        {
          field: 'photos',
          filename: 'b.png',
          contentType: 'image/png',
          buffer: TINY_PNG_ALT,
        },
      ],
    });

    assert(response.status === 200, `status ${response.status}`);
    assert(response.body?.data?.galleryCount === 1, 'one gallery row');
    assert(response.body?.data?.mainPhoto?.startsWith('products/'), 'main photo path');

    const row = await findProductByIdBas(models, productIdBas);
    const plain = row.get({ plain: true });
    assert(plain.main_photo?.startsWith('products/'), 'db main_photo set');

    console.log('integration-media-write-multipart smoke passed');
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
