/**
 * Stage 15.3 — Add id_bas_category to properties table.
 * Allowed databases: test_bd, marketplace_pg (PostgreSQL staging demo only).
 * NEVER runs against autoleg_db.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');

const ALLOWED_DATABASES = new Set(['test_bd', 'marketplace_pg']);

const TARGET_DB = process.env.MIGRATE_TARGET_DB || 'test_bd';

async function columnExistsMySQL(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0].n > 0;
}

async function migrateMySQL(database) {
  const connection = await mysql.createConnection({
    host: process.env.host || '127.0.0.1',
    port: process.env.db_port || 3306,
    user: process.env.user,
    password: process.env.password,
    database,
  });

  try {
    if (await columnExistsMySQL(connection, 'properties', 'id_bas_category')) {
      console.log(`[${database}] id_bas_category already exists — skip`);
      return;
    }

    await connection.query(`
      ALTER TABLE properties
      ADD COLUMN id_bas_category VARCHAR(255) NULL
      COMMENT 'Logical FK to categories.id_bas; NULL = global property'
    `);
    await connection.query(`
      CREATE INDEX idx_properties_id_bas_category ON properties (id_bas_category)
    `);
    console.log(`[${database}] Added id_bas_category + index`);
  } finally {
    await connection.end();
  }
}

async function migratePostgres(database) {
  const sequelize = new Sequelize(
    database,
    process.env.pg_user || process.env.user,
    process.env.pg_password || process.env.password,
    {
      host: process.env.pg_host || '127.0.0.1',
      port: Number(process.env.pg_port || 5432),
      dialect: 'postgres',
      logging: false,
    },
  );

  try {
    const [cols] = await sequelize.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'id_bas_category'
    `);

    if (cols.length > 0) {
      console.log(`[${database}] id_bas_category already exists — skip`);
      return;
    }

    await sequelize.query(`
      ALTER TABLE properties ADD COLUMN id_bas_category VARCHAR(255) NULL
    `);
    await sequelize.query(`
      CREATE INDEX idx_properties_id_bas_category ON properties (id_bas_category)
    `);
    console.log(`[${database}] Added id_bas_category + index`);
  } finally {
    await sequelize.close();
  }
}

async function main() {
  if (!ALLOWED_DATABASES.has(TARGET_DB)) {
    console.error(`Refusing to migrate "${TARGET_DB}". Allowed: ${[...ALLOWED_DATABASES].join(', ')}`);
    process.exit(1);
  }

  if (TARGET_DB === 'marketplace_pg') {
    await migratePostgres(TARGET_DB);
  } else {
    await migrateMySQL(TARGET_DB);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
