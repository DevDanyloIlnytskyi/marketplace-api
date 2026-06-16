'use strict';

/**
 * Platform-6.2 — add records JSON payload column to integration_sync_job_batches.
 */

const TABLE_NAME = 'integration_sync_job_batches';
const COLUMN_NAME = 'records';

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {import('sequelize').Sequelize} Sequelize
 */
async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable(TABLE_NAME);
  if (table[COLUMN_NAME]) {
    return;
  }

  await queryInterface.addColumn(TABLE_NAME, COLUMN_NAME, {
    type: Sequelize.JSON,
    allowNull: true,
  });
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 */
async function down(queryInterface) {
  const table = await queryInterface.describeTable(TABLE_NAME);
  if (!table[COLUMN_NAME]) {
    return;
  }

  await queryInterface.removeColumn(TABLE_NAME, COLUMN_NAME);
}

module.exports = { up, down };
