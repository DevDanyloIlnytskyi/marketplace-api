/**
 * Apply batch status column widening migration.
 *
 * Usage:
 *   node scripts/migrate-integration-sync-batch-status.js up
 */
require('dotenv').config();

const { Sequelize } = require('sequelize');
const migration = require('../migrations/20260616120000-widen-sync-batch-status');

const TARGET_DB = process.env.MIGRATE_TARGET_DB || 'test_bd';

function buildSequelize() {
  return new Sequelize(
    TARGET_DB,
    process.env.user,
    process.env.password,
    {
      host: process.env.host || '127.0.0.1',
      port: Number(process.env.db_port || 3306),
      dialect: 'mysql',
      logging: console.log,
    },
  );
}

async function main() {
  const sequelize = buildSequelize();
  const queryInterface = sequelize.getQueryInterface();
  try {
    await migration.up(queryInterface, Sequelize);
    console.log(`[${TARGET_DB}] batch status column widened OK`);
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
