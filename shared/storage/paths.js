const path = require('path');

const { STORAGE_SUBDIRS } = require('./constants');

function getStorageRoot() {
  if (process.env.MARKETPLACE_STORAGE_ROOT) {
    return path.resolve(process.env.MARKETPLACE_STORAGE_ROOT);
  }
  return path.join(__dirname, '..', '..', 'storage');
}

/**
 * Absolute filesystem root for a tenant: storage/{tenant.storage}/
 * @param {import('../tenant/config').TenantConfig} tenant
 */
function getTenantStoragePath(tenant) {
  return path.join(getStorageRoot(), tenant.storage);
}

/**
 * @param {import('../tenant/config').TenantConfig} tenant
 * @param {string} [filename]
 */
function getTenantLogoPath(tenant, filename = '') {
  const base = path.join(getTenantStoragePath(tenant), STORAGE_SUBDIRS.logos);
  return filename ? path.join(base, filename) : base;
}

/**
 * @param {import('../tenant/config').TenantConfig} tenant
 * @param {string} [filename]
 */
function getTenantProductImagePath(tenant, filename = '') {
  const base = path.join(getTenantStoragePath(tenant), STORAGE_SUBDIRS.products);
  return filename ? path.join(base, filename) : base;
}

/**
 * @param {import('../tenant/config').TenantConfig} tenant
 * @param {string} [filename]
 */
function getTenantMiscPath(tenant, filename = '') {
  const base = path.join(getTenantStoragePath(tenant), STORAGE_SUBDIRS.misc);
  return filename ? path.join(base, filename) : base;
}

/**
 * Ensure standard tenant storage folders exist.
 * @param {import('../tenant/config').TenantConfig} tenant
 */
function ensureTenantStorageDirs(tenant) {
  const fs = require('fs');
  const mkdirp = require('mkdirp');
  const root = getTenantStoragePath(tenant);
  for (const sub of Object.values(STORAGE_SUBDIRS)) {
    mkdirp.sync(path.join(root, sub));
  }
  return root;
}

module.exports = {
  getStorageRoot,
  getTenantStoragePath,
  getTenantLogoPath,
  getTenantProductImagePath,
  getTenantMiscPath,
  ensureTenantStorageDirs,
};
