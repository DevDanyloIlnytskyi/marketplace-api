'use strict';

/**
 * Platform-4.5.4 — create integration_logs table (per-tenant DB).
 */

const TABLE_NAME = 'integration_logs';

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {import('sequelize').Sequelize} Sequelize
 */
async function up(queryInterface, Sequelize) {
  await queryInterface.createTable(TABLE_NAME, {
    id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    tenant_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
    },
    api_key_id: {
      type: Sequelize.CHAR(36),
      allowNull: true,
    },
    request_id: {
      type: Sequelize.CHAR(36),
      allowNull: false,
    },
    method: {
      type: Sequelize.STRING(8),
      allowNull: false,
    },
    path: {
      type: Sequelize.STRING(512),
      allowNull: false,
    },
    status_code: {
      type: Sequelize.SMALLINT,
      allowNull: false,
    },
    success: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
    },
    client_ip: {
      type: Sequelize.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: Sequelize.STRING(512),
      allowNull: true,
    },
    duration_ms: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    request_size: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    response_size: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    error_code: {
      type: Sequelize.STRING(64),
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addIndex(TABLE_NAME, ['tenant_id', 'created_at'], {
    name: 'idx_integration_logs_tenant_created',
  });
  await queryInterface.addIndex(TABLE_NAME, ['api_key_id', 'created_at'], {
    name: 'idx_integration_logs_api_key_created',
  });
  await queryInterface.addIndex(TABLE_NAME, ['request_id'], {
    name: 'idx_integration_logs_request_id',
  });
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 */
async function down(queryInterface) {
  await queryInterface.dropTable(TABLE_NAME);
}

module.exports = { up, down };
