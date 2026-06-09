/**
 * Platform-3.2 — HTTP smoke test against PostgreSQL-backed API.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.port || 5000;
const HOSTS = ['demo.local', 'avtoleg.local'];

function request(method, pathName, host, body, auth) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'X-Marketplace-Host': host,
      'Content-Type': 'application/json',
    };
    if (auth) headers.Authorization = `Bearer ${auth}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      { hostname: '127.0.0.1', port: PORT, path: pathName, method, headers },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () =>
          resolve({ host, path: pathName, status: res.statusCode, body: d.slice(0, 200) }),
        );
      },
    );
    req.on('error', (e) => resolve({ host, path: pathName, error: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  let jwt = process.env.EXPRESS_TECH_JWT;
  if (!jwt) {
    try {
      const env = fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', '.env.local'),
        'utf8',
      );
      jwt = env.match(/^EXPRESS_TECH_JWT=(.+)$/m)?.[1]?.trim();
    } catch {
      /* optional */
    }
  }

  const order = {
    client_first_name: 'PG32',
    client_second_name: 'POC',
    phone: '+380000000088',
    total_price: '100',
    active: false,
    date_created: new Date().toISOString(),
    products: [],
  };

  for (const host of HOSTS) {
    console.log(`\n=== ${host} ===`);
    console.log(await request('GET', '/api/catalog?page=1&limit=2', host));
    console.log(await request('GET', '/api/category', host));
    console.log(await request('GET', '/api/base_info', host));
    console.log(await request('GET', '/api/product', host));
    if (jwt && host === 'demo.local') {
      console.log(await request('POST', '/api/orders', host, order, jwt));
    }
  }
}

main();
