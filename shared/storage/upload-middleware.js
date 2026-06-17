const multer = require('multer');
const moment = require('moment');
const mkdirp = require('mkdirp');

const {
  getTenantProductImagePath,
  ensureTenantStorageDirs,
} = require('./paths');
const {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  createUploadFileFilter,
  sanitizeUploadFilename,
} = require('./upload-validation');

const DEFAULT_UPLOAD_LIMITS = Object.freeze({
  fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
});

/**
 * Build multer disk storage with tenant-scoped product image destination.
 *
 * @returns {multer.StorageEngine}
 */
function createTenantDiskStorage() {
  return multer.diskStorage({
    destination(req, file, cb) {
      if (!req.tenant) {
        return cb(new Error('Tenant context required for file uploads'));
      }
      try {
        ensureTenantStorageDirs(req.tenant);
        const dest = getTenantProductImagePath(req.tenant);
        mkdirp.sync(dest);
        cb(null, dest);
      } catch (error) {
        cb(error);
      }
    },
    filename(req, file, cb) {
      const date = moment().format('DDMMYYYY-HHmmss_SSS');
      const safeName = sanitizeUploadFilename(file.originalname);
      cb(null, `${date}-${safeName}`);
    },
  });
}

/**
 * Create tenant-aware product image upload middleware (multer instance).
 *
 * @param {import('multer').Options} [options]
 * @returns {multer.Multer}
 */
function createProductImageUpload(options = {}) {
  return multer({
    storage: options.storage || createTenantDiskStorage(),
    fileFilter: options.fileFilter || createUploadFileFilter(),
    limits: options.limits || DEFAULT_UPLOAD_LIMITS,
  });
}

/** Default singleton — same behaviour as legacy `api/middleware/upload.js`. */
const defaultProductImageUpload = createProductImageUpload();

module.exports = {
  DEFAULT_UPLOAD_LIMITS,
  createTenantDiskStorage,
  createProductImageUpload,
  defaultProductImageUpload,
};
