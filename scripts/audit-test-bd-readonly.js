/**
 * Read-only schema audit for test_bd only. No writes.
 * Usage: node scripts/audit-test-bd-readonly.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const DB = 'test_bd';

async function main() {
  const c = await mysql.createConnection({
    host: process.env.host || '127.0.0.1',
    port: process.env.db_port || 3306,
    user: process.env.user,
    password: process.env.password,
    database: DB,
  });

  const [tables] = await c.query('SHOW TABLES');
  const tableNames = tables.map((r) => Object.values(r)[0]);
  const report = { database: DB, tables: [] };

  for (const t of tableNames) {
    const [cols] = await c.query(`DESCRIBE \`${t}\``);
    const [cnt] = await c.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    const [idx] = await c.query(`SHOW INDEX FROM \`${t}\``);
    const [fks] = await c.query(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [DB, t],
    );
    report.tables.push({
      name: t,
      rowCount: cnt[0].n,
      columns: cols,
      indexes: idx.map((i) => ({
        Key_name: i.Key_name,
        Column_name: i.Column_name,
        Non_unique: i.Non_unique,
        Index_type: i.Index_type,
      })),
      foreignKeys: fks,
    });
  }

  console.log(JSON.stringify(report, null, 2));
  await c.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
