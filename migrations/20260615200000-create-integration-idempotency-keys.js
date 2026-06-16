'use strict';

/**
 * Platform-5.3 — create integration_idempotency_keys table (per-tenant DB).
 */

const TABLE_NAME = 'integration_idempotency_keys';

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
      allowNull: false,
    },
    idempotency_key: {
      type: Sequelize.STRING(128),
      allowNull: false,
    },
    request_hash: {
      type: Sequelize.CHAR(64),
      allowNull: false,
    },
    http_method: {
      type: Sequelize.STRING(8),
      allowNull: false,
    },
    route_path: {
      type: Sequelize.STRING(512),
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    status_code: {
      type: Sequelize.SMALLINT,
      allowNull: true,
    },
    response_body: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    request_id: {
      type: Sequelize.CHAR(36),
      allowNull: false,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    completed_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
  });

  await queryInterface.addIndex(
    TABLE_NAME,
    ['tenant_id', 'api_key_id', 'idempotency_key'],
    {
      unique: true,
      name: 'uq_integration_idempotency_tenant_key_idempotency',
    },
  );
  await queryInterface.addIndex(TABLE_NAME, ['expires_at'], {
    name: 'idx_integration_idempotency_expires_at',
  });
  await queryInterface.addIndex(TABLE_NAME, ['tenant_id', 'created_at'], {
    name: 'idx_integration_idempotency_tenant_created',
  });
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 */
async function down(queryInterface) {
  await queryInterface.dropTable(TABLE_NAME);
}

module.exports = { up, down };
