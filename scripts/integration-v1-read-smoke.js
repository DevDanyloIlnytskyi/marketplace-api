/**
 * Platform-5.2 — Integration API v1 read-only smoke test.
 *
 * Usage:
 *   node scripts/integration-v1-read-smoke.js
 */
require('dotenv').config();

const http = require('http');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';

/**
 * @param {number} port
 * @param {string} path
 * @param {{ host?: string, apiKey?: string, requestId?: string }} [options]
 */
function httpGet(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const headers = {
      Host: options.host || TENANT_DOMAIN,
    };
    if (options.apiKey) {
      headers['X-API-Key'] = options.apiKey;
    }
    if (options.requestId) {
      headers['X-Request-Id'] = options.requestId;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            json = body;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json,
          });
        });
      },
    );

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);
  const { plaintext, record } = await createKey(models, {
    tenantId: tenant.id,
    label: 'Platform-5.2 integration read smoke',
    scopes: [
      'catalog.read',
      'prices.read',
      'stock.read',
      'orders.read',
    ],
    createdBy: 'integration-v1-read-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;

  try {
    const customRequestId = 'smoke-req-550e8400-e29b-41d4-a716-446655440099';
    const health = await httpGet(port, '/api/integration/v1/health', {
      requestId: customRequestId,
    });
    console.log('health status:', health.status);
    console.log('health requestId echoed:', health.headers['x-request-id'] === customRequestId);

    const whoami = await httpGet(port, '/api/integration/v1/whoami', {
      apiKey: plaintext,
    });
    console.log('whoami status:', whoami.status);
    console.log('whoami scopes:', whoami.body?.data?.scopes);

    const categories = await httpGet(port, '/api/integration/v1/categories', {
      apiKey: plaintext,
    });
    console.log('categories status:', categories.status);

    const products = await httpGet(port, '/api/integration/v1/products?limit=5', {
      apiKey: plaintext,
    });
    console.log('products status:', products.status);

    const orders = await httpGet(port, '/api/integration/v1/orders?limit=5', {
      apiKey: plaintext,
    });
    console.log('orders status:', orders.status);

    const catalog = await httpGet(port, '/api/integration/v1/catalog?limit=5', {
      apiKey: plaintext,
    });
    console.log('catalog status:', catalog.status);

    const legacyCatalog = await httpGet(port, '/api/v1/catalog/?limit=1');
    console.log('legacy catalog status:', legacyCatalog.status);

    const missingKey = await httpGet(port, '/api/integration/v1/whoami');
    console.log('whoami without key status:', missingKey.status);

    if (
      health.status !== 200 ||
      whoami.status !== 200 ||
      categories.status !== 200 ||
      products.status !== 200 ||
      orders.status !== 200 ||
      catalog.status !== 200 ||
      legacyCatalog.status !== 200 ||
      missingKey.status !== 401
    ) {
      throw new Error('Smoke assertions failed — see logs above');
    }

    console.log('integration v1 read smoke passed');
  } finally {
    await revokeKey(models, record.id, 'integration-v1-read-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
