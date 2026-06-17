/**
 * Multipart HTTP helpers for Integration smoke tests.
 */

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Distinct 1×1 PNG (different CRC) for hash-mismatch tests */
const TINY_PNG_ALT = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

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

/**
 * @param {number} port
 * @param {string} routePath
 * @param {'PUT'|'POST'} method
 * @param {{
 *   host: string,
 *   apiKey: string,
 *   idempotencyKey?: string,
 *   fields?: Record<string, string>,
 *   files?: Array<{ field: string, filename: string, contentType: string, buffer: Buffer }>,
 * }} options
 */
function multipartRequest(port, routePath, method, options) {
  const boundary = `----smoke${Date.now()}`;
  const body = buildMultipartBody(options.fields || {}, options.files || [], boundary);

  return new Promise((resolve, reject) => {
    const http = require('http');
    /** @type {Record<string, string>} */
    const headers = {
      Host: options.host,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
      'X-API-Key': options.apiKey,
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: routePath,
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed,
          });
        });
      },
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * @param {number} port
 * @param {string} routePath
 * @param {'PUT'} method
 * @param {{ host: string, apiKey: string, idempotencyKey?: string, body?: object }} options
 */
function jsonRequest(port, routePath, method, options) {
  const http = require('http');
  const payload = options.body ? JSON.stringify(options.body) : '';

  return new Promise((resolve, reject) => {
    const headers = {
      Host: options.host,
      'Content-Type': 'application/json',
      'X-API-Key': options.apiKey,
    };
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }
    if (payload) {
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: routePath,
        method,
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
            body: raw ? JSON.parse(raw) : null,
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

module.exports = {
  TINY_PNG,
  TINY_PNG_ALT,
  buildMultipartBody,
  multipartRequest,
  jsonRequest,
};
