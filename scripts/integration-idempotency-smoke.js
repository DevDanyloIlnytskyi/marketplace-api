/**
 * Platform-5.3 — idempotency middleware smoke test.
 *
 * Usage (after migration on test_bd):
 *   node scripts/integration-idempotency-smoke.js
 */
require('dotenv').config();

const http = require('http');
const app = require('../app');
const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');

const TENANT_DOMAIN = process.env.SMOKE_TENANT_DOMAIN || 'demo.local';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const IDEMPOTENCY_KEY = `smoke-${Date.now()}`;

/**
 * @param {number} port
 * @param {string} path
 * @param {{ apiKey: string, idempotencyKey?: string, body?: object }} options
 */
function httpPost(port, path, options) {
  const payload = JSON.stringify(options.body ?? {});
  return new Promise((resolve, reject) => {
    /** @type {Record<string, string>} */
    const headers = {
      Host: TENANT_DOMAIN,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
      'X-API-Key': options.apiKey,
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(raw),
          });
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
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
    label: 'Platform-5.3 idempotency smoke',
    scopes: ['catalog.read'],
    createdBy: 'integration-idempotency-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = /** @type {import('net').AddressInfo} */ (server.address()).port;
  const path = '/api/integration/v1/debug/idempotency-test';
  const body = { probe: 'alpha' };

  try {
    const first = await httpPost(port, path, {
      apiKey: plaintext,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('request #1 status:', first.status);

    const second = await httpPost(port, path, {
      apiKey: plaintext,
      idempotencyKey: IDEMPOTENCY_KEY,
      body,
    });
    console.log('request #2 status:', second.status);
    console.log('request #2 replay header:', second.headers['x-idempotent-replay']);
    console.log(
      'request #2 same timestamp:',
      second.body?.data?.timestamp === first.body?.data?.timestamp,
    );

    const third = await httpPost(port, path, {
      apiKey: plaintext,
      idempotencyKey: IDEMPOTENCY_KEY,
      body: { probe: 'beta' },
    });
    console.log('request #3 status:', third.status);
    console.log('request #3 code:', third.body?.code);

    const missingKey = await httpPost(port, path, {
      apiKey: plaintext,
      body,
    });
    console.log('missing key status:', missingKey.status);
    console.log('missing key code:', missingKey.body?.code);

    if (
      first.status !== 200 ||
      second.status !== 200 ||
      second.headers['x-idempotent-replay'] !== 'true' ||
      second.body?.data?.timestamp !== first.body?.data?.timestamp ||
      third.status !== 409 ||
      third.body?.code !== 'IDEMPOTENCY_CONFLICT' ||
      missingKey.status !== 400 ||
      missingKey.body?.code !== 'IDEMPOTENCY_KEY_REQUIRED'
    ) {
      throw new Error('Idempotency smoke assertions failed');
    }

    console.log('integration idempotency smoke passed');
  } finally {
    await revokeKey(models, record.id, 'integration-idempotency-smoke cleanup');
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
