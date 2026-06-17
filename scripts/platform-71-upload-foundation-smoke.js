/**
 * Platform-7.1 — Upload foundation smoke tests.
 *
 * Covers:
 * - shared upload validation utilities
 * - tenant-scoped multer storage
 * - legacy product update without file preserves main_photo
 * - invalid MIME / oversized file handling
 *
 * Usage:
 *   node scripts/platform-71-upload-foundation-smoke.js
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');

const app = require('../app');
const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const { createKey, revokeKey } = require('../shared/integration/keys');
const { findProductByIdBas } = require('../shared/catalog/product-repository');
const {
  isAllowedUploadMime,
  sanitizeUploadFilename,
  isWithinUploadSizeLimit,
  normalizeUploadError,
  MAX_UPLOAD_FILE_SIZE_BYTES,
} = require('../shared/storage/upload-validation');
const {
  createProductImageUpload,
} = require('../shared/storage/upload-middleware');
const {
  getTenantProductImagePath,
  getStoredMediaPath,
} = require('../shared/storage');
const findorcreate = require('../controllers/products').findorcreate;

const smokeTenant = resolveSmokeTenant();
const TEST_ID_BAS = `p71-upload-${Date.now()}`;
const EXISTING_PHOTO = 'products/p71-preserve-main.webp';

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function testValidationUtilities() {
  assert(isAllowedUploadMime('image/png'), 'png allowed');
  assert(isAllowedUploadMime('image/jpeg'), 'jpeg allowed');
  assert(!isAllowedUploadMime('application/pdf'), 'pdf rejected');
  assert(!isAllowedUploadMime(''), 'empty mime rejected');

  assert(
    sanitizeUploadFilename('../../evil.png') === 'evil.png',
    'basename strips traversal',
  );
  assert(
    sanitizeUploadFilename('photo.webp') === 'photo.webp',
    'normal filename preserved',
  );
  assert(
    sanitizeUploadFilename('') === 'upload.bin',
    'empty filename fallback',
  );

  assert(isWithinUploadSizeLimit(1024), '1KB within limit');
  assert(!isWithinUploadSizeLimit(MAX_UPLOAD_FILE_SIZE_BYTES + 1), 'oversize rejected');

  const normalized = normalizeUploadError({
    name: 'MulterError',
    code: 'LIMIT_FILE_SIZE',
    message: 'File too large',
  });
  assert(normalized?.code === 'UPLOAD_FILE_TOO_LARGE', 'multer size error normalized');
  assert(normalized?.status === 413, 'multer size status 413');

  console.log('validation utilities: ok');
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {Promise<{ statusCode: number, body: unknown }>}
 */
function invokeHandler(handler, req, res) {
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    let statusCode = 200;
    /** @type {unknown} */
    let body = null;

    res.status = function status(code) {
      statusCode = code;
      return originalStatus(code);
    };
    res.json = function json(payload) {
      body = payload;
      return originalJson(payload);
    };

    Promise.resolve(handler(req, res))
      .then(() => resolve({ statusCode, body }))
      .catch(reject);
  });
}

/**
 * @param {Record<string, string>} fields
 * @param {Array<{ field: string, filename: string, contentType: string, buffer: Buffer }>} files
 * @param {string} boundary
 */
function buildMultipartBody(fields, files, boundary) {
  /** @type {Buffer[]} */
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ));
  }

  for (const file of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ));
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

async function testMulterTenantStorage(tenant) {
  const { Readable } = require('stream');
  const upload = createProductImageUpload();
  const dest = getTenantProductImagePath(tenant);
  const beforeFiles = new Set(fs.existsSync(dest) ? fs.readdirSync(dest) : []);

  const boundary = `----p71multer${Date.now()}`;
  const body = buildMultipartBody(
    {},
    [{ field: 'main_photo', filename: 'smoke-upload.png', contentType: 'image/png', buffer: TINY_PNG }],
    boundary,
  );

  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
  Object.assign(req, {
    tenant,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    method: 'POST',
  });

  const file = await new Promise((resolve, reject) => {
    const res = { status() { return this; }, json() { return this; } };
    upload.single('main_photo')(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(req.file);
    });
  });

  assert(file && file.path, 'multer saved file');
  assert(fs.existsSync(file.path), 'uploaded file exists on disk');
  assert(file.path.startsWith(dest), `file under tenant storage: ${file.path}`);

  const storedPath = getStoredMediaPath(file);
  assert(storedPath.startsWith('products/'), `stored path prefix: ${storedPath}`);
  assert(storedPath.includes('smoke-upload.png'), `filename preserved in path: ${storedPath}`);

  const afterFiles = fs.readdirSync(dest);
  const newFiles = afterFiles.filter((name) => !beforeFiles.has(name));
  assert(newFiles.length >= 1, 'new file appeared in tenant directory');

  fs.unlinkSync(file.path);
  console.log('multer tenant storage: ok', storedPath);
}

async function testInvalidMimeRejected(tenant) {
  const { Readable } = require('stream');
  const upload = createProductImageUpload();
  const boundary = `----p71badmime${Date.now()}`;
  const body = buildMultipartBody(
    {},
    [{
      field: 'main_photo',
      filename: 'bad.pdf',
      contentType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    }],
    boundary,
  );

  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
  Object.assign(req, {
    tenant,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    method: 'POST',
  });

  await new Promise((resolve, reject) => {
    const res = { status() { return this; }, json() { return this; } };
    upload.single('main_photo')(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  assert(!req.file, 'invalid MIME must not produce req.file');
  console.log('invalid MIME rejected: ok');
}

async function testOversizedFileRejected(tenant) {
  const { Readable } = require('stream');
  const upload = createProductImageUpload();
  const boundary = `----p71big${Date.now()}`;
  const oversized = Buffer.alloc(MAX_UPLOAD_FILE_SIZE_BYTES + 1024, 0x89);
  const body = buildMultipartBody(
    {},
    [{
      field: 'main_photo',
      filename: 'big.png',
      contentType: 'image/png',
      buffer: oversized,
    }],
    boundary,
  );

  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
  Object.assign(req, {
    tenant,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    method: 'POST',
  });

  let caught = null;
  await new Promise((resolve) => {
    const res = { status() { return this; }, json() { return this; } };
    upload.single('main_photo')(req, res, (err) => {
      caught = err;
      resolve();
    });
  });

  assert(caught, 'oversized upload must error');
  const normalized = normalizeUploadError(caught);
  assert(normalized?.code === 'UPLOAD_FILE_TOO_LARGE', 'oversized normalized');
  console.log('oversized file rejected: ok');
}

async function testUpdateWithoutFilePreservesPhoto(models, tenant, categoryId) {
  const existing = await models.Product.findOne({ where: { id_bas: TEST_ID_BAS } });
  if (existing) {
    await existing.destroy();
  }

  await models.Product.create({
    id_bas: TEST_ID_BAS,
    name: 'P71 preserve test',
    description: 'before update',
    categories_id: categoryId,
    actual: true,
    manufacturer: 'Smoke',
    main_photo: EXISTING_PHOTO,
  });

  const req = {
    body: {
      id_bas: TEST_ID_BAS,
      name: 'P71 preserve test updated',
      description: 'after update',
      categories_id: String(categoryId),
      actual: '1',
      manufacturer: 'Smoke',
    },
    file: undefined,
    models,
    tenant,
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  const result = await invokeHandler(findorcreate, req, res);
  assert(result.statusCode === 200, `update status ${result.statusCode}`);

  const row = await models.Product.findOne({ where: { id_bas: TEST_ID_BAS }, raw: true });
  assert(row.main_photo === EXISTING_PHOTO, `main_photo preserved: got ${row.main_photo}`);
  assert(row.name === 'P71 preserve test updated', 'name updated');

  await models.Product.destroy({ where: { id_bas: TEST_ID_BAS } });
  console.log('update without file preserves photo: ok');
}

async function testUploadSetsPhotoPath(models, tenant, categoryId) {
  const upload = createProductImageUpload();
  const dest = getTenantProductImagePath(tenant);
  const boundary = `----p71create${Date.now()}`;
  const body = buildMultipartBody(
    {
      id_bas: TEST_ID_BAS,
      name: 'P71 upload create',
      categories_id: String(categoryId),
      description: 'upload smoke',
      actual: '1',
      manufacturer: 'Smoke',
    },
    [{ field: 'main_photo', filename: 'create.png', contentType: 'image/png', buffer: TINY_PNG }],
    boundary,
  );

  const { Readable } = require('stream');
  const req = new Readable({
    read() {
      this.push(body);
      this.push(null);
    },
  });
  Object.assign(req, {
    tenant,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    method: 'POST',
    body: {
      id_bas: TEST_ID_BAS,
      name: 'P71 upload create',
      categories_id: String(categoryId),
      description: 'upload smoke',
      actual: '1',
      manufacturer: 'Smoke',
    },
    models,
  });

  await new Promise((resolve, reject) => {
    const res = { status() { return this; }, json() { return this; } };
    upload.single('main_photo')(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });

  assert(req.file, 'create upload produced file');
  assert(req.file.path.startsWith(dest), 'file in tenant dir');

  const handlerRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
  const result = await invokeHandler(findorcreate, req, handlerRes);
  assert(result.statusCode === 200, `create handler status ${result.statusCode}`);

  const row = await models.Product.findOne({ where: { id_bas: TEST_ID_BAS }, raw: true });
  assert(row, 'product row created');
  assert(row.main_photo === getStoredMediaPath(req.file), `DB path matches upload: ${row.main_photo}`);
  assert(fs.existsSync(req.file.path), 'uploaded file still on disk');

  await models.Product.destroy({ where: { id_bas: TEST_ID_BAS } });
  fs.unlinkSync(req.file.path);
  console.log('upload sets photo path: ok', row.main_photo);
}

async function testTenantIsolation(tenant) {
  const { listTenants } = require('../shared/tenant/registry');

  const pathA = getTenantProductImagePath(tenant);
  assert(pathA.includes(`${path.sep}${tenant.storage}${path.sep}`), `tenant path contains storage key: ${pathA}`);

  const otherTenant = listTenants().find((entry) => entry.storage !== tenant.storage)
    || { ...tenant, storage: `${tenant.storage}-isolation-check` };
  const pathB = getTenantProductImagePath(otherTenant);

  assert(pathA !== pathB, 'different tenants resolve to different storage directories');
  assert(pathB.includes(`${path.sep}${otherTenant.storage}${path.sep}`), `other tenant path: ${pathB}`);

  console.log('tenant isolation: ok');
}

/**
 * @param {number} port
 * @param {string} routePath
 * @param {'PUT'} method
 * @param {{ apiKey: string, idempotencyKey: string, body: object }} options
 */
function integrationRequest(port, routePath, method, options) {
  const payload = JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: routePath,
        method,
        headers: {
          Host: smokeTenant.tenantDomain,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload).toString(),
          'X-API-Key': options.apiKey,
          'Idempotency-Key': options.idempotencyKey,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function testIntegrationRegression(models) {
  const sequelize = models.sequelize || getTenantConnection(smokeTenant.tenant);
  try {
    await sequelize.query('SELECT 1 FROM integration_api_keys LIMIT 1');
  } catch {
    console.log('integration JSON regression: SKIP (integration_api_keys table missing)');
    return;
  }

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category for integration regression');
  }

  const categoryRow = category.get({ plain: true });
  const idBas = `${TEST_ID_BAS}-integration`;
  const idempotencyKey = `p71-int-${Date.now()}`;

  const { plaintext, record } = await createKey(models, {
    tenantId: smokeTenant.tenantId,
    label: 'Platform-7.1 upload foundation smoke',
    scopes: ['catalog.write'],
    createdBy: 'platform-71-upload-foundation-smoke',
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const response = await integrationRequest(
      port,
      `/api/integration/v1/products/${encodeURIComponent(idBas)}`,
      'PUT',
      {
        apiKey: plaintext,
        idempotencyKey,
        body: {
          name: 'P71 integration regression',
          categoryIdBas: categoryRow.id_bas,
          description: 'unchanged JSON path',
        },
      },
    );

    assert(response.status === 200, `integration PUT status ${response.status}`);
    assert(response.body?.success === true, 'integration envelope success');

    const product = await findProductByIdBas(models, idBas);
    assert(product, 'integration product created');

    await models.Product.destroy({ where: { id_bas: idBas } });
    console.log('integration JSON regression: ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await revokeKey(models, record.id);
  }
}

async function main() {
  console.log(`[smoke] tenant=${smokeTenant.tenantId} domain=${smokeTenant.tenantDomain}`);

  testValidationUtilities();

  const tenant = smokeTenant.tenant;
  const models = getTenantModels(tenant);
  getTenantConnection(tenant);

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category in tenant DB — cannot run DB smoke');
  }
  const categoryId = category.get({ plain: true }).id;

  await testMulterTenantStorage(tenant);
  await testInvalidMimeRejected(tenant);
  await testOversizedFileRejected(tenant);
  await testTenantIsolation(tenant);
  await testUpdateWithoutFilePreservesPhoto(models, tenant, categoryId);
  await testUploadSetsPhotoPath(models, tenant, categoryId);
  await testIntegrationRegression(models);

  console.log('\nPLATFORM_7_STAGE_1_COMPLETE');
}

main().catch((error) => {
  console.error('\nBLOCKERS');
  console.error(error);
  process.exit(1);
});
