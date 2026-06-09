const Sequelize = require('sequelize');
require('dotenv').config();

const { defineTenantModels } = require('./model-registry');

/** @type {Map<string, import('sequelize').Sequelize>} */
const connectionPool = new Map();

/** @type {Map<string, ReturnType<defineTenantModels>>} */
const modelPool = new Map();

/**
 * @param {import('./config').TenantConfig} tenant
 * @returns {'mysql' | 'postgres'}
 */
function resolveDialect(tenant) {
  const raw = tenant.dialect || process.env.DB_DIALECT || 'mysql';
  const dialect = String(raw).toLowerCase();
  if (dialect === 'postgres' || dialect === 'postgresql') {
    return 'postgres';
  }
  return 'mysql';
}

/**
 * @param {import('./config').TenantConfig} tenant
 */
function getConnectionKey(tenant) {
  return `${resolveDialect(tenant)}:${tenant.database}`;
}

/**
 * @param {import('./config').TenantConfig} tenant
 */
function buildSequelizeOptions(tenant) {
  const dialect = resolveDialect(tenant);
  const isPostgres = dialect === 'postgres';

  return {
    host: isPostgres
      ? process.env.pg_host || process.env.host
      : process.env.host,
    port: Number(
      isPostgres
        ? process.env.pg_port || process.env.db_port || 5432
        : process.env.db_port || 3306,
    ),
    dialect,
    define: { timestamps: false },
    logging: process.env.SEQUELIZE_LOGGING === 'true' ? console.log : false,
    pool: {
      max: Number(process.env.TENANT_POOL_MAX || 5),
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  };
}

/**
 * @param {import('./config').TenantConfig} tenant
 */
function getConnectionCredentials(tenant) {
  const dialect = resolveDialect(tenant);
  if (dialect === 'postgres') {
    return {
      database: tenant.database,
      username: process.env.pg_user || process.env.user,
      password: process.env.pg_password || process.env.password,
    };
  }
  return {
    database: tenant.database,
    username: process.env.user,
    password: process.env.password,
  };
}

/**
 * One Sequelize instance per tenant database (lazy, cached).
 * @param {import('./config').TenantConfig} tenant
 * @returns {import('sequelize').Sequelize}
 */
function getTenantConnection(tenant) {
  const key = getConnectionKey(tenant);
  if (!connectionPool.has(key)) {
    const dialect = resolveDialect(tenant);
    const { database, username, password } = getConnectionCredentials(tenant);
    const sequelize = new Sequelize(
      database,
      username,
      password,
      buildSequelizeOptions(tenant),
    );
    connectionPool.set(key, sequelize);
    sequelize
      .authenticate()
      .then(() =>
        console.log(
          `[tenant] Connected ${dialect} database="${tenant.database}" host=${tenant.domain}`,
        ),
      )
      .catch((err) =>
        console.error(
          `[tenant] Connection error ${dialect} database="${tenant.database}":`,
          err.message,
        ),
      );
  }
  return connectionPool.get(key);
}

/**
 * Sequelize models bound to the tenant connection.
 * @param {import('./config').TenantConfig} tenant
 */
function getTenantModels(tenant) {
  const key = getConnectionKey(tenant);
  if (!modelPool.has(key)) {
    const sequelize = getTenantConnection(tenant);
    modelPool.set(key, defineTenantModels(sequelize));
  }
  return modelPool.get(key);
}

/**
 * Attach tenant context to an Express request.
 * @param {import('express').Request} req
 * @param {import('./config').TenantConfig} tenant
 */
function attachTenantContext(req, tenant) {
  const sequelize = getTenantConnection(tenant);
  const models = getTenantModels(tenant);
  req.tenant = tenant;
  req.sequelize = sequelize;
  req.models = models;
}

/** Close all tenant connections (tests / graceful shutdown). */
async function closeAllTenantConnections() {
  const closes = [...connectionPool.values()].map((conn) => conn.close());
  await Promise.all(closes);
  connectionPool.clear();
  modelPool.clear();
}

module.exports = {
  resolveDialect,
  getConnectionKey,
  getTenantConnection,
  getTenantModels,
  attachTenantContext,
  closeAllTenantConnections,
};
