const fs = require('fs');
const path = require('path');

const { TenantResolutionError, tenantErrorStatus } = require('../tenant/errors');
const { resolveTenantFromRequest } = require('../tenant/resolve');
const { resolveStorageCandidates } = require('./image-url');

const LEGACY_IMAGES_DIR = path.join(__dirname, '..', '..', 'images');

/**
 * Tenant-aware static file handler for GET /images/*
 */
function tenantImagesMiddleware(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  let tenant;
  try {
    tenant = resolveTenantFromRequest(req);
  } catch (error) {
    if (error instanceof TenantResolutionError) {
      return res.status(tenantErrorStatus(error)).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }
    return res.status(400).json({
      success: false,
      code: 'INVALID_TENANT',
      message: error instanceof Error ? error.message : 'Unknown tenant',
    });
  }

  const candidates = resolveStorageCandidates(tenant, req.path);
  candidates.push(path.join(LEGACY_IMAGES_DIR, req.path.replace(/^\/+/, '')));

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return res.sendFile(path.resolve(filePath));
      }
    } catch {
      /* try next candidate */
    }
  }

  return res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Image not found for tenant "${tenant.id}"`,
  });
}

module.exports = tenantImagesMiddleware;
