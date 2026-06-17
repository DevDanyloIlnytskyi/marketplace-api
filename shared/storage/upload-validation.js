const path = require('path');

/** Max upload size — matches legacy multer limit (5 MB). */
const MAX_UPLOAD_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed image MIME types — matches legacy upload middleware behaviour. */
const ALLOWED_UPLOAD_MIMES = Object.freeze([
  'image/png',
  'image/jpg',
  'image/jpeg',
  'image/svg',
  'image/webp',
  'image/avif',
]);

/**
 * @param {string | undefined} mimetype
 * @returns {boolean}
 */
function isAllowedUploadMime(mimetype) {
  if (!mimetype || typeof mimetype !== 'string') {
    return false;
  }
  return ALLOWED_UPLOAD_MIMES.includes(mimetype.trim().toLowerCase());
}

/**
 * Strip directory components from client-provided filename.
 * Preserves the base name used in `{timestamp}-{name}` storage keys.
 *
 * @param {string | undefined} originalname
 * @returns {string}
 */
function sanitizeUploadFilename(originalname) {
  const base = path.basename(String(originalname || '').trim());
  if (!base || base === '.' || base === '..') {
    return 'upload.bin';
  }
  return base;
}

/**
 * @param {number} sizeBytes
 * @returns {boolean}
 */
function isWithinUploadSizeLimit(sizeBytes) {
  return typeof sizeBytes === 'number'
    && Number.isFinite(sizeBytes)
    && sizeBytes > 0
    && sizeBytes <= MAX_UPLOAD_FILE_SIZE_BYTES;
}

/**
 * Multer-compatible file filter — rejects disallowed MIME via `cb(null, false)` (legacy behaviour).
 *
 * @returns {import('multer').Options['fileFilter']}
 */
function createUploadFileFilter() {
  return function uploadFileFilter(req, file, cb) {
    if (isAllowedUploadMime(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  };
}

/**
 * Normalize multer and upload errors for HTTP middleware (optional consumer).
 *
 * @param {unknown} error
 * @returns {{ code: string, message: string, status: number } | null}
 */
function normalizeUploadError(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }

  if (error.name === 'MulterError') {
    /** @type {import('multer').MulterError} */
    const multerError = error;
    if (multerError.code === 'LIMIT_FILE_SIZE') {
      return {
        code: 'UPLOAD_FILE_TOO_LARGE',
        message: `File exceeds maximum size of ${MAX_UPLOAD_FILE_SIZE_BYTES} bytes.`,
        status: 413,
      };
    }
    return {
      code: 'UPLOAD_ERROR',
      message: multerError.message || 'Upload failed.',
      status: 400,
    };
  }

  if (error instanceof Error && error.message === 'Tenant context required for file uploads') {
    return {
      code: 'TENANT_REQUIRED',
      message: error.message,
      status: 400,
    };
  }

  return null;
}

/**
 * Express error middleware for multer upload failures.
 *
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function handleUploadError(err, req, res, next) {
  const normalized = normalizeUploadError(err);
  if (!normalized) {
    return next(err);
  }

  return res.status(normalized.status).json({
    success: false,
    code: normalized.code,
    message: normalized.message,
  });
}

module.exports = {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  ALLOWED_UPLOAD_MIMES,
  isAllowedUploadMime,
  sanitizeUploadFilename,
  isWithinUploadSizeLimit,
  createUploadFileFilter,
  normalizeUploadError,
  handleUploadError,
};
