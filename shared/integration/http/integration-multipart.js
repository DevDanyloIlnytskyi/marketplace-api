const { createProductImageUpload } = require('../../storage/upload-middleware');
const { createStagingDiskStorage, cleanupStagingDirectory } = require('../../storage/staging-storage');
const { attachMultipartFingerprint } = require('../idempotency/multipart-fingerprint');
const { handleUploadError } = require('../../storage/upload-validation');

const MEDIA_PHOTO_MAX_COUNT = 50;

/**
 * @param {import('multer').Options} [options]
 */
function createStagingUpload(options = {}) {
  return createProductImageUpload({
    storage: createStagingDiskStorage(),
    ...options,
  });
}

/**
 * @param {import('express').RequestHandler} multerMiddleware
 * @returns {import('express').RequestHandler}
 */
function wrapStagingUpload(multerMiddleware) {
  return function stagingUploadMiddleware(req, res, next) {
    multerMiddleware(req, res, (error) => {
      if (error) {
        cleanupStagingDirectory(req);
        return next(error);
      }
      return next();
    });
  };
}

const stageProductUpload = wrapStagingUpload(
  createStagingUpload().single('main_photo'),
);

const stageMediaUpload = wrapStagingUpload(
  createStagingUpload().fields([
    { name: 'photos', maxCount: MEDIA_PHOTO_MAX_COUNT },
    { name: 'photos[]', maxCount: MEDIA_PHOTO_MAX_COUNT },
  ]),
);

/** Multipart parse + fingerprint only (idempotency and promote wired in routes). */
const integrationMultipartProductParseChain = [
  stageProductUpload,
  attachMultipartFingerprint,
];

/** Multipart parse + fingerprint for media PUT. */
const integrationMultipartMediaParseChain = [
  stageMediaUpload,
  attachMultipartFingerprint,
];

module.exports = {
  MEDIA_PHOTO_MAX_COUNT,
  createStagingUpload,
  wrapStagingUpload,
  stageProductUpload,
  stageMediaUpload,
  integrationMultipartProductParseChain,
  integrationMultipartMediaParseChain,
  integrationUploadErrorHandler: handleUploadError,
};
