const path = require('path');

const { MEDIA_PUBLIC_PREFIX } = require('./constants');

/**
 * Normalize a DB or upload path to a site-relative public media URL.
 * @param {string | null | undefined} dbPath
 * @returns {string | null}
 */
function resolvePublicMediaPath(dbPath) {
  if (!dbPath || typeof dbPath !== 'string' || dbPath.trim() === '') {
    return null;
  }

  if (/^https?:\/\//i.test(dbPath)) {
    return dbPath;
  }

  let relative = dbPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const prefix = `${MEDIA_PUBLIC_PREFIX}/`.replace(/^\/+/, '');

  if (relative.startsWith(prefix)) {
    relative = relative.slice(prefix.length);
  }
  if (relative.startsWith('images/')) {
    relative = relative.slice('images/'.length);
  }

  const segments = relative.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return `${MEDIA_PUBLIC_PREFIX}/${segments.join('/')}`;
}

/**
 * Build absolute browser URL for media (Express origin + public path).
 * @param {string | null | undefined} dbPath
 * @param {string} expressOrigin - e.g. http://127.0.0.1:5000
 * @returns {string | null}
 */
function buildPublicImageUrl(dbPath, expressOrigin) {
  const publicPath = resolvePublicMediaPath(dbPath);
  if (!publicPath) {
    return null;
  }
  if (/^https?:\/\//i.test(publicPath)) {
    return publicPath;
  }
  const origin = expressOrigin.replace(/\/$/, '');
  return `${origin}${publicPath.startsWith('/') ? publicPath : `/${publicPath}`}`;
}

/**
 * Map HTTP request path under /images to filesystem candidates under tenant storage.
 * @param {string} requestPath - req.path from /images mount
 */
function resolveStorageCandidates(tenant, requestPath) {
  const { getTenantStoragePath, getTenantProductImagePath, getTenantLogoPath, getTenantMiscPath } =
    require('./paths');

  const cleaned = requestPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const basename = path.basename(cleaned);
  const root = getTenantStoragePath(tenant);

  /** @type {string[]} */
  const candidates = [];

  if (cleaned) {
    candidates.push(path.join(root, cleaned));
  }
  if (basename) {
    candidates.push(getTenantProductImagePath(tenant, basename));
    candidates.push(getTenantLogoPath(tenant, basename));
    candidates.push(getTenantMiscPath(tenant, basename));
  }

  return candidates;
}

module.exports = {
  MEDIA_PUBLIC_PREFIX,
  resolvePublicMediaPath,
  buildPublicImageUrl,
  resolveStorageCandidates,
};
