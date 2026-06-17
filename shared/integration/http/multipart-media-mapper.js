const { getStoredMediaPath } = require('../../storage/upload-path');
const { collectUploadedFiles } = require('../../storage/staging-storage');
const { isMultipartRequest } = require('./content-type-detect');

/**
 * Ordered photo paths from promoted multipart files.
 *
 * @param {import('express').Request} req
 * @returns {string[]}
 */
function collectPromotedPhotoPaths(req) {
  if (Array.isArray(req.promotedMediaPaths) && req.promotedMediaPaths.length > 0) {
    return req.promotedMediaPaths;
  }

  const files = collectUploadedFiles(req);
  return files.map((file) => getStoredMediaPath(file));
}

/**
 * Map multipart media PUT → ReplacePhotoSetInput.
 *
 * @param {import('express').Request} req
 * @param {string} productIdBas
 * @returns {import('../../catalog/media-write/media-write.types').ReplacePhotoSetInput}
 */
function mapMultipartMediaToInput(req, productIdBas) {
  const body = req.body || {};
  const fromFiles = collectPromotedPhotoPaths(req);

  if (fromFiles.length > 0) {
    return {
      productIdBas,
      photos: fromFiles,
    };
  }

  if (Array.isArray(body.photos)) {
    return {
      productIdBas,
      photos: body.photos,
    };
  }

  return {
    productIdBas,
    photos: [],
  };
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function shouldUseMultipartMediaMapper(req) {
  return isMultipartRequest(req) || Boolean(req.isMultipartIntegrationWrite);
}

module.exports = {
  mapMultipartMediaToInput,
  shouldUseMultipartMediaMapper,
  collectPromotedPhotoPaths,
};
