const path = require('path');

const { STORAGE_SUBDIRS } = require('./constants');

/**
 * Relative media path stored in DB after tenant-scoped upload.
 * Resolves to GET /images/products/{filename} via tenantImagesMiddleware.
 * @param {Express.Multer.File | undefined} file
 * @param {string} [subdir='products']
 * @returns {string}
 */
function getStoredMediaPath(file, subdir = STORAGE_SUBDIRS.products) {
  if (!file || !file.path) {
    return '';
  }
  const filename = path.basename(file.path);
  return `${subdir}/${filename}`;
}

module.exports = {
  getStoredMediaPath,
};
