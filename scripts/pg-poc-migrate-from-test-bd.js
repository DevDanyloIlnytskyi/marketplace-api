/**
 * Platform-3.2 — Migrate data MySQL test_bd → PostgreSQL marketplace_pg ONLY.
 * NEVER reads autoleg_db.
 */
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env.postgres.staging'),
});

const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');
const { defineTenantModels } = require('../shared/tenant/model-registry');

const MYSQL_DB = process.env.mysql_database || 'test_bd';
const PG_DB = 'marketplace_pg';

const TABLE_ORDER = [
  'properties',
  'categories',
  'users',
  'base_info',
  'products',
  'products_price',
  'products_quantity',
  'products_photos',
  'products_properties',
  'orders',
];

async function fetchTable(mysqlConn, table) {
  const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);
  return rows;
}

async function resetSequences(sequelize, table, column = 'id') {
  await sequelize.query(
    `SELECT setval(pg_get_serial_sequence('"${table}"', '${column}'), COALESCE((SELECT MAX("${column}") FROM "${table}"), 1), true)`,
  ).catch(() => {});
}

async function main() {
  if (MYSQL_DB === 'autoleg_db') {
    throw new Error('Refusing to migrate from autoleg_db');
  }

  const mysqlConn = await mysql.createConnection({
    host: process.env.mysql_host || process.env.host,
    port: Number(process.env.mysql_port || process.env.db_port || 3306),
    user: process.env.mysql_user || process.env.user,
    password: process.env.mysql_password || process.env.password,
    database: MYSQL_DB,
  });

  const sequelize = new Sequelize(PG_DB, process.env.pg_user, process.env.pg_password, {
    host: process.env.pg_host || '127.0.0.1',
    port: Number(process.env.pg_port || 5432),
    dialect: 'postgres',
    logging: false,
    define: { timestamps: false },
  });

  const models = defineTenantModels(sequelize);
  const report = { source: MYSQL_DB, target: PG_DB, tables: [] };

  for (const table of TABLE_ORDER) {
    const rows = await fetchTable(mysqlConn, table);
    let inserted = 0;
    let failed = 0;

    if (rows.length === 0) {
      report.tables.push({ table, mysqlRows: 0, pgInserted: 0, failed: 0 });
      continue;
    }

    const modelKey = {
      properties: 'Propertie',
      categories: 'Category',
      users: 'User',
      base_info: 'BaseInfo',
      products: 'Product',
      products_price: 'Products_price',
      products_quantity: 'Products_quantity',
      products_photos: 'Products_photo',
      products_properties: 'Products_propertie',
      orders: 'Orders',
    }[table];

    const Model = models[modelKey];

    if (table === 'categories') {
      rows.sort((a, b) => {
        if (a.categories_id == null && b.categories_id != null) return -1;
        if (a.categories_id != null && b.categories_id == null) return 1;
        return a.id - b.id;
      });
    }

    for (const row of rows) {
      try {
        const payload = { ...row };
        if (payload.products && typeof payload.products === 'string') {
          payload.products = JSON.parse(payload.products);
        }
        await Model.create(payload);
        inserted += 1;
      } catch (err) {
        failed += 1;
        if (failed <= 3) {
          console.error(`[${table}] insert failed:`, err.message);
        }
      }
    }

    if (table !== 'products_price' && table !== 'products_quantity') {
      await resetSequences(sequelize, table);
    }

    report.tables.push({
      table,
      mysqlRows: rows.length,
      pgInserted: inserted,
      failed,
    });
    console.log(`${table}: ${inserted}/${rows.length} (failed ${failed})`);
  }

  await mysqlConn.end();
  await sequelize.close();

  console.log('\n--- MIGRATION REPORT ---');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
