'use strict';

/**
 * Tenant registry path resolver (API runtime — shipped with backend package).
 * BFF mirror (keep in sync): frontend/src/shared/api/server/resolve-tenant-registry-path.ts
 */

const fs = require('fs');
const path = require('path');

/** Production absolute path (documented constant). */
const PRODUCTION_REGISTRY_PATH = '/opt/marketplace/config/clients.json';

/** Repo-relative segment — always config/clients.json under repo root. */
const REPO_REGISTRY_RELATIVE = path.join('config', 'clients.json');

/**
 * Ordered fallbacks when TENANT_REGISTRY_PATH is unset (monorepo-safe).
 * Never includes api/config/clients.json.
 * @param {string} cwd — typically process.cwd() or package directory
 * @returns {string[]}
 */
function buildDevCandidates(cwd) {
  const resolvedCwd = path.resolve(cwd);
  // Prefer repo-root config/ before package-local config/ (avoids api/config/clients.json).
  return [
    path.join(resolvedCwd, '..', REPO_REGISTRY_RELATIVE),
    path.join(resolvedCwd, '..', '..', REPO_REGISTRY_RELATIVE),
    path.join(resolvedCwd, REPO_REGISTRY_RELATIVE),
  ];
}

/**
 * Resolve tenant registry file path.
 * @param {{ cwd?: string, mustExist?: boolean }} [options]
 * @returns {string} absolute path
 */
function resolveTenantRegistryPath(options = {}) {
  const { cwd = process.cwd(), mustExist = true } = options;

  if (process.env.TENANT_REGISTRY_PATH) {
    const explicit = path.resolve(process.env.TENANT_REGISTRY_PATH);
    if (mustExist && !fs.existsSync(explicit)) {
      throw new Error(`TENANT_REGISTRY_PATH not found: ${explicit}`);
    }
    return explicit;
  }

  for (const candidate of buildDevCandidates(cwd)) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  if (mustExist) {
    throw new Error(
      'Tenant registry not found. Set TENANT_REGISTRY_PATH or create config/clients.json at repo root.',
    );
  }

  // Write target for provisioning when file does not exist yet
  return path.resolve(cwd, '..', REPO_REGISTRY_RELATIVE);
}

module.exports = {
  PRODUCTION_REGISTRY_PATH,
  REPO_REGISTRY_RELATIVE,
  buildDevCandidates,
  resolveTenantRegistryPath,
};
