const { normalizeMediaPathKey } = require('../../product/gallery-paths');

const MAX_PHOTO_PATH_LENGTH = 255;

/**
 * Normalize stored photo path for persistence (trim, forward slashes).
 * @param {string} raw
 * @returns {string}
 */
function normalizePhotoPath(raw) {
  return String(raw).trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * @param {unknown} value
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {string} photoPath
 */
function validatePhotoPath(photoPath) {
  if (!isNonEmptyString(photoPath)) {
    return { valid: false, reason: 'empty' };
  }
  if (photoPath.length > MAX_PHOTO_PATH_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }
  if (photoPath.includes('..')) {
    return { valid: false, reason: 'path_traversal' };
  }
  if (/^https?:\/\//i.test(photoPath)) {
    return { valid: false, reason: 'absolute_url' };
  }
  return { valid: true, normalized: normalizePhotoPath(photoPath) };
}

/**
 * Validate ordered photo path list — rejects duplicates (case/path normalized).
 * @param {unknown} photos
 * @returns {string[]}
 */
function validateAndNormalizePhotoList(photos) {
  if (!Array.isArray(photos)) {
    throw new Error('INVALID_MEDIA_PAYLOAD');
  }

  /** @type {string[]} */
  const normalized = [];
  const seen = new Set();

  for (const entry of photos) {
    const check = validatePhotoPath(entry);
    if (!check.valid || !check.normalized) {
      throw new Error('INVALID_PHOTO_PATH');
    }
    const key = normalizeMediaPathKey(check.normalized);
    if (seen.has(key)) {
      throw new Error('DUPLICATE_PHOTO');
    }
    seen.add(key);
    normalized.push(check.normalized);
  }

  return normalized;
}

module.exports = {
  MAX_PHOTO_PATH_LENGTH,
  normalizePhotoPath,
  validatePhotoPath,
  validateAndNormalizePhotoList,
};
