'use strict';

/**
 * Platform-6.1 — integration sync job infrastructure (per-tenant DB).
 */

const JOBS_TABLE = 'integration_sync_jobs';
const BATCHES_TABLE = 'integration_sync_job_batches';
const EVENTS_TABLE = 'integration_sync_job_events';

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 * @param {import('sequelize').Sequelize} Sequelize
 */
async function up(queryInterface, Sequelize) {
  await queryInterface.createTable(JOBS_TABLE, {
    id: {
      type: Sequelize.CHAR(36),
      allowNull: false,
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
    job_type: {
      type: Sequelize.STRING(32),
      allowNull: false,
    },
    sync_mode: {
      type: Sequelize.STRING(16),
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    current_phase: {
      type: Sequelize.STRING(16),
      allowNull: true,
    },
    total_records: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    processed_records: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    created_count: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    updated_count: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    failed_count: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    skipped_count: {
      type: Sequelize.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },
    batch_size: {
      type: Sequelize.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    last_completed_batch_index: {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: -1,
    },
    last_completed_phase: {
      type: Sequelize.STRING(16),
      allowNull: true,
    },
    client_reference: {
      type: Sequelize.STRING(128),
      allowNull: true,
    },
    worker_id: {
      type: Sequelize.STRING(128),
      allowNull: true,
    },
    heartbeat_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    lease_expires_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    source_type: {
      type: Sequelize.STRING(32),
      allowNull: true,
    },
    source_uri: {
      type: Sequelize.STRING(512),
      allowNull: true,
    },
    error_summary: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    metadata: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    started_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    finished_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    expires_at: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addIndex(JOBS_TABLE, ['tenant_id', 'status'], {
    name: 'idx_integration_sync_jobs_tenant_status',
  });
  await queryInterface.addIndex(JOBS_TABLE, ['tenant_id', 'client_reference'], {
    name: 'idx_integration_sync_jobs_tenant_client_ref',
  });
  await queryInterface.addIndex(JOBS_TABLE, ['tenant_id', 'idempotency_key'], {
    name: 'idx_integration_sync_jobs_tenant_idempotency',
  });
  await queryInterface.addIndex(
    JOBS_TABLE,
    ['tenant_id', 'api_key_id', 'idempotency_key'],
    {
      unique: true,
      name: 'uq_integration_sync_jobs_tenant_key_idempotency',
    },
  );

  await queryInterface.createTable(BATCHES_TABLE, {
    id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    job_id: {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: JOBS_TABLE, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    phase: {
      type: Sequelize.STRING(16),
      allowNull: false,
    },
    batch_index: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    status: {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: 'pending',
    },
    item_count: {
      type: Sequelize.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    processed_count: {
      type: Sequelize.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    failed_count: {
      type: Sequelize.SMALLINT,
      allowNull: false,
      defaultValue: 0,
    },
    errors: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    started_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    finished_at: {
      type: Sequelize.DATE,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addIndex(
    BATCHES_TABLE,
    ['job_id', 'phase', 'batch_index'],
    {
      unique: true,
      name: 'uq_integration_sync_job_batches_job_phase_index',
    },
  );
  await queryInterface.addIndex(BATCHES_TABLE, ['job_id', 'phase', 'status'], {
    name: 'idx_integration_sync_job_batches_job_phase_status',
  });

  await queryInterface.createTable(EVENTS_TABLE, {
    id: {
      type: Sequelize.BIGINT,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    job_id: {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: JOBS_TABLE, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    tenant_id: {
      type: Sequelize.STRING(64),
      allowNull: false,
    },
    event_type: {
      type: Sequelize.STRING(32),
      allowNull: false,
    },
    phase: {
      type: Sequelize.STRING(16),
      allowNull: true,
    },
    batch_index: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    detail: {
      type: Sequelize.JSON,
      allowNull: true,
    },
    created_at: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addIndex(EVENTS_TABLE, ['job_id', 'created_at'], {
    name: 'idx_integration_sync_job_events_job_created',
  });
  await queryInterface.addIndex(EVENTS_TABLE, ['tenant_id', 'created_at'], {
    name: 'idx_integration_sync_job_events_tenant_created',
  });
}

/**
 * @param {import('sequelize').QueryInterface} queryInterface
 */
async function down(queryInterface) {
  await queryInterface.dropTable(EVENTS_TABLE);
  await queryInterface.dropTable(BATCHES_TABLE);
  await queryInterface.dropTable(JOBS_TABLE);
}

module.exports = { up, down };
