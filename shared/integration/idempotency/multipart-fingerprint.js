const crypto = require('crypto');
const fs = require('fs');

const { stableStringify, resolveFingerprintPath } = require('./request-fingerprint');
const { collectUploadedFiles } = require('../../storage/staging-storage');

/**
 * @typedef {Object} MultipartFileFingerprintPart
 * @property {string} fieldName
 * @property {string} mimetype
 * @property {number} size
 * @property {string} sha256Hex
 */

/**
 * Compute SHA-256 hex digest of staged file bytes.
 *
 * @param {string} filePath
 * @returns {string}
 */
function hashFileBytes(filePath) {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Build ordered file fingerprint parts from staged multer files.
 *
 * @param {import('express').Request} req
 * @returns {MultipartFileFingerprintPart[]}
 */
function buildMultipartFileFingerprintParts(req) {
  const files = collectUploadedFiles(req);

  return files.map((file) => ({
    fieldName: String(file.fieldname || ''),
    mimetype: String(file.mimetype || ''),
    size: Number(file.size || 0),
    sha256Hex: hashFileBytes(file.path),
  }));
}

/**
 * Serialize file parts for fingerprint payload (stable field order applied upstream).
 *
 * @param {MultipartFileFingerprintPart[]} fileParts
 * @returns {string}
 */
function serializeFileFingerprintParts(fileParts) {
  return fileParts
    .map((part) => `${part.fieldName}|${part.mimetype}|${part.size}|${part.sha256Hex}`)
    .join('\n');
}

/**
 * File-aware fingerprint for multipart Integration writes.
 *
 * fingerprint = SHA-256(
 *   METHOD + "\n" +
 *   PATH + "\n" +
 *   stableStringify(textFields) + "\n" +
 *   FOR EACH file: fieldName|mimetype|size|sha256Hex
 * )
 *
 * @param {import('express').Request} req
 * @returns {string} hex digest
 */
function computeMultipartRequestFingerprint(req) {
  const method = String(req.method || 'GET').toUpperCase();
  const routePath = resolveFingerprintPath(req);
  const textFields = req.body === undefined || req.body === null ? {} : req.body;
  const fileParts = buildMultipartFileFingerprintParts(req);
  const sortedParts = [...fileParts].sort((a, b) => a.fieldName.localeCompare(b.fieldName));

  const payload = [
    method,
    routePath,
    stableStringify(textFields),
    serializeFileFingerprintParts(sortedParts),
  ].join('\n');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Attach multipart fingerprint context after staging upload.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function attachMultipartFingerprint(req, res, next) {
  try {
    req.multipartFingerprintParts = buildMultipartFileFingerprintParts(req);
    req.isMultipartIntegrationWrite = true;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  hashFileBytes,
  buildMultipartFileFingerprintParts,
  serializeFileFingerprintParts,
  computeMultipartRequestFingerprint,
  attachMultipartFingerprint,
};
