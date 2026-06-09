/**
 * Platform-3.2 — Sync Sequelize models to PostgreSQL schema (force on empty DB).
 * Target databases from clients.poc.postgres.json
 */
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env.postgres.staging'),
});

const { Sequelize } = require('sequelize');
const { defineTenantModels } = require('../shared/tenant/model-registry');
const { loadRegistry } = require('../shared/tenant/registry');

async function syncDatabase(database) {
  const sequelize = new Sequelize(
    database,
    process.env.pg_user,
    process.env.pg_password,
    {
      host: process.env.pg_host || '127.0.0.1',
      port: Number(process.env.pg_port || 5432),
      dialect: 'postgres',
      logging: console.log,
      define: { timestamps: false },
    },
  );

  defineTenantModels(sequelize);

  console.log(`\n=== sync ${database} ===`);
  await sequelize.sync({ force: true });
  const [tables] = await sequelize.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  console.log(
    'Tables:',
    tables.map((t) => t.tablename).join(', '),
  );
  await sequelize.close();
}

async function main() {
  process.env.DB_DIALECT = 'postgres';
  const { clients } = loadRegistry();
  const dbs = [...new Set(clients.map((c) => c.database))];

  for (const db of dbs) {
    await syncDatabase(db);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
