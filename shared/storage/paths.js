const path = require('path');

const { STORAGE_SUBDIRS } = require('./constants');

/**
 * Development fallback when MARKETPLACE_STORAGE_ROOT is unset.
 * Resolves to {api_package_root}/storage (e.g. api/storage in the repo).
 * Production must set MARKETPLACE_STORAGE_ROOT explicitly — enforced in validate-env.js.
 */
const DEFAULT_STORAGE_ROOT = path.join(__dirname, '..', '..', 'storage');

function getDefaultStorageRoot() {
  return DEFAULT_STORAGE_ROOT;
}

function getStorageRoot() {
  const raw = process.env.MARKETPLACE_STORAGE_ROOT;
  if (raw && String(raw).trim()) {
    return path.resolve(String(raw).trim());
  }
  return DEFAULT_STORAGE_ROOT;
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
  DEFAULT_STORAGE_ROOT,
  getDefaultStorageRoot,
  getStorageRoot,
  getTenantStoragePath,
  getTenantLogoPath,
  getTenantProductImagePath,
  getTenantMiscPath,
  ensureTenantStorageDirs,
};
