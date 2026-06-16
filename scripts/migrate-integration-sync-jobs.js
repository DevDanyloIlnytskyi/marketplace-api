/**
 * Run Platform-6.1 migration for integration sync tables on a single tenant database.
 *
 * Usage:
 *   node scripts/migrate-integration-sync-jobs.js up
 *   node scripts/migrate-integration-sync-jobs.js down
 */
require('dotenv').config();

const { Sequelize } = require('sequelize');
const migration = require('../migrations/20260615210000-create-integration-sync-tables');

const TARGET_DB = process.env.MIGRATE_TARGET_DB || 'test_bd';
const DIRECTION = (process.argv[2] || 'up').toLowerCase();
const TABLE_NAME = 'integration_sync_jobs';

function resolveDialect() {
  const raw = String(process.env.DB_DIALECT || 'mysql').toLowerCase();
  if (raw === 'postgres' || raw === 'postgresql') {
    return 'postgres';
  }
  return 'mysql';
}

function buildSequelize() {
  const dialect = resolveDialect();
  const isPostgres = dialect === 'postgres';

  return new Sequelize(
    TARGET_DB,
    isPostgres
      ? process.env.pg_user || process.env.user
      : process.env.user,
    isPostgres
      ? process.env.pg_password || process.env.password
      : process.env.password,
    {
      host: isPostgres
        ? process.env.pg_host || process.env.host || '127.0.0.1'
        : process.env.host || '127.0.0.1',
      port: Number(
        isPostgres
          ? process.env.pg_port || 5432
          : process.env.db_port || 3306,
      ),
      dialect,
      logging: console.log,
    },
  );
}

async function tableExists(sequelize) {
  const dialect = sequelize.getDialect();
  if (dialect === 'postgres') {
    const [rows] = await sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = '${TABLE_NAME}'`,
    );
    return rows.length > 0;
  }

  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = '${TABLE_NAME}'`,
  );
  return rows.length > 0;
}

async function main() {
  if (!['up', 'down'].includes(DIRECTION)) {
    console.error('Usage: node scripts/migrate-integration-sync-jobs.js [up|down]');
    process.exit(1);
  }

  const sequelize = buildSequelize();
  const queryInterface = sequelize.getQueryInterface();

  try {
    if (DIRECTION === 'up') {
      if (await tableExists(sequelize)) {
        console.log(`[${TARGET_DB}] ${TABLE_NAME} already exists — skip`);
        return;
      }
      await migration.up(queryInterface, Sequelize);
      console.log(`[${TARGET_DB}] migration up OK`);
      return;
    }

    if (!(await tableExists(sequelize))) {
      console.log(`[${TARGET_DB}] ${TABLE_NAME} missing — skip down`);
      return;
    }
    await migration.down(queryInterface);
    console.log(`[${TARGET_DB}] migration down OK`);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
