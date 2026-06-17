const crypto = require('crypto');

/**
 * Deterministic JSON serialization — object keys sorted recursively.
 * Array order is preserved.
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  if (value === undefined) {
    return '';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

/**
 * Normalized route path for fingerprinting (no query string).
 * @param {import('express').Request} req
 */
function resolveFingerprintPath(req) {
  const raw = req.originalUrl || req.url || req.path || '';
  return raw.split('?')[0];
}

/**
 * Build SHA-256 fingerprint from method + route + canonical body.
 * Multipart requests delegate to file-aware fingerprint when flagged.
 *
 * @param {import('express').Request} req
 * @returns {string} hex digest
 */
function computeRequestFingerprint(req) {
  if (req.isMultipartIntegrationWrite) {
    const { computeMultipartRequestFingerprint } = require('./multipart-fingerprint');
    return computeMultipartRequestFingerprint(req);
  }

  const method = String(req.method || 'GET').toUpperCase();
  const path = resolveFingerprintPath(req);
  const body = req.body === undefined || req.body === null ? {} : req.body;
  const payload = `${method}\n${path}\n${stableStringify(body)}`;

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

module.exports = {
  stableStringify,
  resolveFingerprintPath,
  computeRequestFingerprint,
};
