const { DataTypes } = require('sequelize');

const { INTEGRATION_KEY_STATUS } = require('./constants');

/**
 * Sequelize model for per-tenant integration API keys (Platform-4.5.1).
 * Registered via defineTenantModels — not used until migration is applied.
 * @param {import('sequelize').Sequelize} sequelize
 */
function defineIntegrationApiKeyModel(sequelize) {
  return sequelize.define(
    'integration_api_keys',
    {
      id: {
        type: DataTypes.CHAR(36),
        primaryKey: true,
        allowNull: false,
      },
      tenant_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      label: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      key_prefix: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      key_hash: {
        type: DataTypes.CHAR(64),
        allowNull: false,
        unique: true,
      },
      scopes: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: INTEGRATION_KEY_STATUS.ACTIVE,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      revoke_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      last_used_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      created_by: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      rotated_from_id: {
        type: DataTypes.CHAR(36),
        allowNull: true,
      },
      rotated_to_id: {
        type: DataTypes.CHAR(36),
        allowNull: true,
      },
      rate_limit_rpm: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
      indexes: [
        { name: 'idx_integration_api_keys_tenant_status', fields: ['tenant_id', 'status'] },
        { name: 'idx_integration_api_keys_tenant_prefix', fields: ['tenant_id', 'key_prefix'] },
        { name: 'idx_integration_api_keys_expires_at', fields: ['expires_at'] },
        { name: 'idx_integration_api_keys_last_used_at', fields: ['last_used_at'] },
      ],
    },
  );
}

module.exports = { defineIntegrationApiKeyModel };
