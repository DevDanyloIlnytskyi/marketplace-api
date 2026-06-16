const { DataTypes } = require('sequelize');

const { IDEMPOTENCY_STATUS } = require('./constants');

/**
 * Per-tenant idempotency record store (Platform-5.3).
 * @param {import('sequelize').Sequelize} sequelize
 */
function defineIntegrationIdempotencyKeyModel(sequelize) {
  return sequelize.define(
    'integration_idempotency_keys',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      tenant_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      api_key_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
      idempotency_key: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      request_hash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
      },
      http_method: {
        type: DataTypes.STRING(8),
        allowNull: false,
      },
      route_path: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: IDEMPOTENCY_STATUS.PENDING,
      },
      status_code: {
        type: DataTypes.SMALLINT,
        allowNull: true,
      },
      response_body: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      request_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
      indexes: [
        {
          name: 'uq_integration_idempotency_tenant_key_idempotency',
          unique: true,
          fields: ['tenant_id', 'api_key_id', 'idempotency_key'],
        },
        {
          name: 'idx_integration_idempotency_expires_at',
          fields: ['expires_at'],
        },
        {
          name: 'idx_integration_idempotency_tenant_created',
          fields: ['tenant_id', 'created_at'],
        },
      ],
    },
  );
}

module.exports = { defineIntegrationIdempotencyKeyModel };
