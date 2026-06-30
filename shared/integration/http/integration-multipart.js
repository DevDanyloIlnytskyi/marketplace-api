const { createProductImageUpload } = require('../../storage/upload-middleware');
const { createStagingDiskStorage, cleanupStagingDirectory } = require('../../storage/staging-storage');
const { attachMultipartFingerprint } = require('../idempotency/multipart-fingerprint');
const { isIntegrationIdempotencyEnabled } = require('../idempotency/config');
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

/**
 * Staging parse chain for product multipart PUT.
 * Fingerprint step included only when direct-write idempotency is enabled.
 *
 * @returns {import('express').RequestHandler[]}
 */
function getIntegrationMultipartProductParseChain() {
  const chain = [stageProductUpload];
  if (isIntegrationIdempotencyEnabled()) {
    chain.push(attachMultipartFingerprint);
  }
  return chain;
}

/**
 * Staging parse chain for media multipart PUT.
 *
 * @returns {import('express').RequestHandler[]}
 */
function getIntegrationMultipartMediaParseChain() {
  const chain = [stageMediaUpload];
  if (isIntegrationIdempotencyEnabled()) {
    chain.push(attachMultipartFingerprint);
  }
  return chain;
}

/** @deprecated Use getIntegrationMultipartProductParseChain() */
const integrationMultipartProductParseChain = getIntegrationMultipartProductParseChain();

/** @deprecated Use getIntegrationMultipartMediaParseChain() */
const integrationMultipartMediaParseChain = getIntegrationMultipartMediaParseChain();

module.exports = {
  MEDIA_PHOTO_MAX_COUNT,
  createStagingUpload,
  wrapStagingUpload,
  stageProductUpload,
  stageMediaUpload,
  getIntegrationMultipartProductParseChain,
  getIntegrationMultipartMediaParseChain,
  integrationMultipartProductParseChain,
  integrationMultipartMediaParseChain,
  integrationUploadErrorHandler: handleUploadError,
};
