const fs = require('fs');
const path = require('path');
const moment = require('moment');
const mkdirp = require('mkdirp');

const {
  getTenantProductImagePath,
  ensureTenantStorageDirs,
} = require('../../storage/paths');
const { sanitizeUploadFilename } = require('../../storage/upload-validation');
const {
  collectUploadedFiles,
  cleanupStagingDirectory,
} = require('../../storage/staging-storage');
const { getStoredMediaPath } = require('../../storage/upload-path');

/**
 * Promote staged uploads into final tenant product storage.
 * Promote staged uploads into final tenant product storage.
 * Runs after optional idempotency proceed — replay/conflict never reach this middleware when idempotency is enabled.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function promoteStagedUploads(req, res, next) {
  try {
    if (!req.stagingDirectory) {
      req.uploadPromotedPaths = [];
      req.promotedMediaPaths = [];
      return next();
    }

    if (!req.tenant) {
      throw new Error('Tenant context required for file uploads');
    }

    ensureTenantStorageDirs(req.tenant);
    const destDir = getTenantProductImagePath(req.tenant);
    mkdirp.sync(destDir);

    const stagedFiles = collectUploadedFiles(req);
    /** @type {string[]} */
    const absolutePaths = [];
    /** @type {string[]} */
    const relativePaths = [];
    /** @type {Express.Multer.File[]} */
    const promotedFiles = [];

    for (const file of stagedFiles) {
      const finalName = `${moment().format('DDMMYYYY-HHmmss_SSS')}-${sanitizeUploadFilename(file.originalname)}`;
      const finalAbsolutePath = path.join(destDir, finalName);
      fs.renameSync(file.path, finalAbsolutePath);
      absolutePaths.push(finalAbsolutePath);
      relativePaths.push(getStoredMediaPath({ path: finalAbsolutePath }));
      promotedFiles.push({
        ...file,
        path: finalAbsolutePath,
        filename: finalName,
        destination: destDir,
      });
    }

    req.uploadPromotedPaths = absolutePaths;
    req.promotedMediaPaths = relativePaths;

    if (promotedFiles.length === 1) {
      req.file = promotedFiles[0];
      req.files = undefined;
    } else if (promotedFiles.length > 1) {
      req.file = undefined;
      req.files = promotedFiles;
    }

    cleanupStagingDirectory(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  promoteStagedUploads,
};
