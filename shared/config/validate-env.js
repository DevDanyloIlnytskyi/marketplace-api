const fs = require('fs');
const path = require('path');

const DEFAULT_REGISTRY = path.join(__dirname, '../../config/clients.json');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function resolveDialect() {
  const raw = String(process.env.DB_DIALECT || 'mysql').toLowerCase();
  if (raw === 'postgres' || raw === 'postgresql') {
    return 'postgres';
  }
  return 'mysql';
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Fail fast on missing or invalid environment before Express listens.
 * @throws {Error}
 */
function validateEnv() {
  const errors = [];
  const dialect = resolveDialect();
  const prod = isProduction();

  if (!process.env.jwtkey || String(process.env.jwtkey).length < 16) {
    errors.push('jwtkey: required (minimum 16 characters)');
  }

  if (dialect === 'postgres') {
    if (!process.env.pg_user && !process.env.user) {
      errors.push('pg_user (or user): required when DB_DIALECT=postgres');
    }
    if (!process.env.pg_password && !process.env.password) {
      errors.push('pg_password (or password): required when DB_DIALECT=postgres');
    }
  } else if (!process.env.user) {
    errors.push('user: required for MySQL database connections');
  } else if (!process.env.password) {
    errors.push('password: required for MySQL database connections');
  }

  const registryPath = process.env.TENANT_REGISTRY_PATH || DEFAULT_REGISTRY;
  if (!fileExists(registryPath)) {
    errors.push(`TENANT_REGISTRY_PATH: file not found (${registryPath})`);
  }

  if (prod) {
    const rawStorageRoot = process.env.MARKETPLACE_STORAGE_ROOT;
    if (!rawStorageRoot || !String(rawStorageRoot).trim()) {
      errors.push(
        'MARKETPLACE_STORAGE_ROOT: required in production (e.g. /opt/marketplace/storage)',
      );
    } else {
      const storageRoot = path.resolve(String(rawStorageRoot).trim());
      if (!dirExists(storageRoot)) {
        errors.push(`MARKETPLACE_STORAGE_ROOT: directory not found (${storageRoot})`);
      }
    }
  } else if (
    process.env.MARKETPLACE_STORAGE_ROOT
    && !dirExists(path.resolve(String(process.env.MARKETPLACE_STORAGE_ROOT).trim()))
  ) {
    errors.push(
      `MARKETPLACE_STORAGE_ROOT: directory not found (${process.env.MARKETPLACE_STORAGE_ROOT})`,
    );
  }

  if (prod && process.env.TENANT_TRUST_FORWARDED_HOST === 'true') {
    errors.push('TENANT_TRUST_FORWARDED_HOST: should be false in production unless strictly controlled');
  }

  if (prod && (!process.env.jwtkey || process.env.jwtkey === 'unas-test-ip')) {
    errors.push('jwtkey: must not use development default in production');
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }
}

module.exports = {
  validateEnv,
};
