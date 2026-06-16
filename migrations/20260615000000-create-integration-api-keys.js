'use strict';

/**
 * Platform-4.5.1 — create integration_api_keys table (per-tenant DB).
 * Supports MySQL and PostgreSQL.
 */

const TABLE_NAME = 'integration_api_keys';

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {import('sequelize').Sequelize} Sequelize
 */
async function up(queryInterface, Sequelize) {
  const dialect = queryInterface.sequelize.getDialect();
  const jsonType =
    dialect === 'postgres' ? Sequelize.JSONB : Sequelize.JSON;

  await queryInterface.createTable(TABLE_NAME, {
    id: {
      type: Sequelize.CHAR(36),
      allowNull: false,
      primaryKey: true,
    },
    tenant_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
    },
    label: {
      type: Sequelize.STRING(255),
      allowNull: false,
    },
    key_prefix: {
      type: Sequelize.STRING(16),
      allowNull: false,
    },
    key_hash: {
      type: Sequelize.CHAR(64),
      allowNull: false,
      unique: true,
    },
    scopes: {
      type: jsonType,
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: 'active',
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    revoked_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    revoke_reason: {
      type: Sequelize.STRING(255),
      allowNull: true,
    },
    last_used_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal(
        dialect === 'postgres' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP',
      ),
    },
    created_by: {
      type: Sequelize.STRING(128),
      allowNull: true,
    },
    rotated_from_id: {
      type: Sequelize.CHAR(36),
      allowNull: true,
    },
    rotated_to_id: {
      type: Sequelize.CHAR(36),
      allowNull: true,
    },
    rate_limit_rpm: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
  });

  await queryInterface.addIndex(TABLE_NAME, ['tenant_id', 'status'], {
    name: 'idx_integration_api_keys_tenant_status',
  });
  await queryInterface.addIndex(TABLE_NAME, ['tenant_id', 'key_prefix'], {
    name: 'idx_integration_api_keys_tenant_prefix',
  });
  await queryInterface.addIndex(TABLE_NAME, ['expires_at'], {
    name: 'idx_integration_api_keys_expires_at',
  });
  await queryInterface.addIndex(TABLE_NAME, ['last_used_at'], {
    name: 'idx_integration_api_keys_last_used_at',
  });
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 */
async function down(queryInterface) {
  await queryInterface.dropTable(TABLE_NAME);
}

module.exports = { up, down };
