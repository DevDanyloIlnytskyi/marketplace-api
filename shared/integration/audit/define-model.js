const { DataTypes } = require('sequelize');

/**
 * Sequelize model for integration request audit logs (Platform-4.5.4).
 * Metadata only — no secrets, bodies, or stack traces.
 * @param {import('sequelize').Sequelize} sequelize
 */
function defineIntegrationLogModel(sequelize) {
  return sequelize.define(
    'integration_logs',
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
        allowNull: true,
      },
      request_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
      method: {
        type: DataTypes.STRING(8),
        allowNull: false,
      },
      path: {
        type: DataTypes.STRING(512),
        allowNull: false,
      },
      status_code: {
        type: DataTypes.SMALLINT,
        allowNull: false,
      },
      success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
      },
      client_ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      user_agent: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      duration_ms: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      request_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      response_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      error_code: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
      indexes: [
        { name: 'idx_integration_logs_tenant_created', fields: ['tenant_id', 'created_at'] },
        { name: 'idx_integration_logs_api_key_created', fields: ['api_key_id', 'created_at'] },
        { name: 'idx_integration_logs_request_id', fields: ['request_id'] },
      ],
    },
  );
}

module.exports = { defineIntegrationLogModel };
