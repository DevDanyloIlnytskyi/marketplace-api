/**
 * Run Platform-6.2 migration — batch records column.
 *
 * Usage:
 *   node scripts/migrate-integration-sync-batch-records.js up
 */
require('dotenv').config();

const { Sequelize } = require('sequelize');
const migration = require('../migrations/20260615220000-add-sync-batch-records');

const TARGET_DB = process.env.MIGRATE_TARGET_DB || 'test_bd';
const DIRECTION = (process.argv[2] || 'up').toLowerCase();

function buildSequelize() {
  const dialect = String(process.env.DB_DIALECT || 'mysql').toLowerCase();
  const isPostgres = dialect === 'postgres' || dialect === 'postgresql';

  return new Sequelize(
    TARGET_DB,
    isPostgres ? process.env.pg_user || process.env.user : process.env.user,
    isPostgres ? process.env.pg_password || process.env.password : process.env.password,
    {
      host: isPostgres
        ? process.env.pg_host || process.env.host || '127.0.0.1'
        : process.env.host || '127.0.0.1',
      port: Number(
        isPostgres ? process.env.pg_port || 5432 : process.env.db_port || 3306,
      ),
      dialect: isPostgres ? 'postgres' : 'mysql',
      logging: console.log,
    },
  );
}

async function main() {
  const sequelize = buildSequelize();
  const queryInterface = sequelize.getQueryInterface();

  try {
    if (DIRECTION === 'up') {
      await migration.up(queryInterface, Sequelize);
      console.log(`[${TARGET_DB}] batch records migration up OK`);
    } else {
      await migration.down(queryInterface);
      console.log(`[${TARGET_DB}] batch records migration down OK`);
    }
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
