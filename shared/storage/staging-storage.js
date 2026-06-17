const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

const { sanitizeUploadFilename } = require('./upload-validation');
const { getTenantStoragePath } = require('./paths');

const STAGING_DIR_NAME = '.staging';

/**
 * @param {import('../tenant/config').TenantConfig} tenant
 * @param {string} requestId
 * @returns {string}
 */
function getStagingDirectory(tenant, requestId) {
  const safeRequestId = String(requestId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeRequestId) {
    throw new Error('requestId required for staging upload');
  }
  return path.join(getTenantStoragePath(tenant), STAGING_DIR_NAME, safeRequestId);
}

/**
 * Ensure tenant staging directory exists for the current request.
 *
 * @param {import('express').Request} req
 * @returns {string} absolute staging path
 */
function ensureRequestStagingDirectory(req) {
  if (!req.tenant) {
    throw new Error('Tenant context required for file uploads');
  }
  if (!req.requestId) {
    throw new Error('requestId required for staging upload');
  }
  const stagingDir = getStagingDirectory(req.tenant, req.requestId);
  mkdirp.sync(stagingDir);
  req.stagingDirectory = stagingDir;
  return stagingDir;
}

/**
 * Multer disk storage targeting storage/{tenant}/.staging/{requestId}/.
 *
 * @returns {import('multer').StorageEngine}
 */
function createStagingDiskStorage() {
  const multer = require('multer');

  return multer.diskStorage({
    destination(req, file, cb) {
      try {
        const dest = ensureRequestStagingDirectory(req);
        cb(null, dest);
      } catch (error) {
        cb(error);
      }
    },
    filename(req, file, cb) {
      const safeName = sanitizeUploadFilename(file.originalname);
      const field = String(file.fieldname || 'file').replace(/[^a-zA-Z0-9._\[\]-]/g, '_');
      cb(null, `${field}-${Date.now()}-${safeName}`);
    },
  });
}

/**
 * Collect multer file(s) from request in stable order (field name, then original index).
 *
 * @param {import('express').Request} req
 * @returns {Express.Multer.File[]}
 */
function collectUploadedFiles(req) {
  /** @type {Express.Multer.File[]} */
  const files = [];

  if (req.file) {
    files.push(req.file);
  }

  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    const keys = Object.keys(req.files).sort();
    for (const key of keys) {
      const group = req.files[key];
      if (Array.isArray(group)) {
        files.push(...group);
      }
    }
  }

  return files.sort((a, b) => a.fieldname.localeCompare(b.fieldname));
}

/**
 * Remove staging directory for the current request (best effort).
 *
 * @param {import('express').Request} req
 */
function cleanupStagingDirectory(req) {
  const stagingDir = req.stagingDirectory
    || (req.tenant && req.requestId
      ? getStagingDirectory(req.tenant, req.requestId)
      : null);

  if (!stagingDir || !fs.existsSync(stagingDir)) {
    return;
  }

  try {
    const entries = fs.readdirSync(stagingDir);
    for (const entry of entries) {
      const entryPath = path.join(stagingDir, entry);
      try {
        if (fs.statSync(entryPath).isFile()) {
          fs.unlinkSync(entryPath);
        }
      } catch {
        /* ignore */
      }
    }
    fs.rmdirSync(stagingDir);
  } catch {
    /* best effort */
  }

  req.stagingDirectory = undefined;
}

module.exports = {
  STAGING_DIR_NAME,
  getStagingDirectory,
  ensureRequestStagingDirectory,
  createStagingDiskStorage,
  collectUploadedFiles,
  cleanupStagingDirectory,
};
