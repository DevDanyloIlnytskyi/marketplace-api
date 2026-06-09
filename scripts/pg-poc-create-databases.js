/**
 * Platform-3.2 — Create PostgreSQL POC databases and role.
 * Requires: pg_superuser_password in .env.postgres.staging
 * Does NOT touch autoleg_db or MySQL.
 */
const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env.postgres.staging'),
});

const { Client } = require('pg');

const PG_USER = process.env.pg_user || 'marketplace_pg';
const PG_PASSWORD = process.env.pg_password || 'change_me_poc_local';
const DATABASES = ['marketplace_pg', 'marketplace_pg_avtoleg'];

async function main() {
  const admin = new Client({
    host: process.env.pg_host || '127.0.0.1',
    port: Number(process.env.pg_port || 5432),
    user: process.env.pg_superuser || 'postgres',
    password: process.env.pg_superuser_password,
    database: 'postgres',
  });

  await admin.connect();

  const roleCheck = await admin.query(
    'SELECT 1 FROM pg_roles WHERE rolname = $1',
    [PG_USER],
  );

  if (roleCheck.rowCount === 0) {
    await admin.query(
      `CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASSWORD.replace(/'/g, "''")}'`,
    );
    console.log(`Created role ${PG_USER}`);
  } else {
    console.log(`Role ${PG_USER} already exists`);
  }

  for (const db of DATABASES) {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [db],
    );
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${db} OWNER ${PG_USER}`);
      console.log(`Created database ${db}`);
    } else {
      console.log(`Database ${db} already exists`);
    }
  }

  await admin.end();
  console.log('PostgreSQL POC databases ready.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
