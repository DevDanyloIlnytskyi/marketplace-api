const { DataTypes } = require('sequelize');

const SYNC_JOB_STATUSES = Object.freeze([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);

const SYNC_JOB_TYPES = Object.freeze([
  'full_catalog',
  'products',
  'prices',
  'stock',
  'media',
]);

const SYNC_MODES = Object.freeze(['full', 'incremental']);

const SYNC_PHASES = Object.freeze(['products', 'prices', 'stock', 'media', 'done']);

const BATCH_STATUSES = Object.freeze([
  'uploaded',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
]);

const SYNC_EVENT_TYPES = Object.freeze([
  'job.created',
  'job.started',
  'job.paused',
  'job.resumed',
  'job.completed',
  'job.failed',
  'job.cancelled',
  'batch.uploaded',
  'batch.started',
  'batch.completed',
  'batch.failed',
  'phase.completed',
]);

/** Max product records per chunk upload (Platform-6.2). */
const SYNC_PRODUCT_CHUNK_MAX = 100;

/** Max price records per chunk upload (Platform-6.3). */
const SYNC_PRICE_CHUNK_MAX = 250;

/** Max stock records per chunk upload (Platform-6.4). */
const SYNC_STOCK_CHUNK_MAX = 500;

/** Max media records per chunk upload (Platform-6.5). */
const SYNC_MEDIA_CHUNK_MAX = 50;

/** Phases supported for chunk upload (Platform-6.5). */
const SUPPORTED_CHUNK_PHASES = Object.freeze(['products', 'prices', 'stock', 'media']);

/** Ordered processing sequence for multi-phase jobs. */
const SYNC_PHASE_ORDER = Object.freeze(['products', 'prices', 'stock', 'media']);

/** Active job statuses — tenant-wide mutex applies. */
const ACTIVE_SYNC_JOB_STATUSES = Object.freeze(['pending', 'running', 'paused']);

/** Lease duration for worker ownership (5 minutes). */
const SYNC_LEASE_DURATION_MS = 5 * 60 * 1000;

/** Job row retention (30 days). */
const SYNC_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** No-op worker processing delay. */
const SYNC_NOOP_WORKER_DELAY_MS = 2000;

/** Worker poll interval. */
const SYNC_WORKER_POLL_INTERVAL_MS = 1000;

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
function defineIntegrationSyncJobModel(sequelize) {
  return sequelize.define(
    'integration_sync_jobs',
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
      api_key_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
      idempotency_key: {
        type: DataTypes.STRING(128),
        allowNull: false,
      },
      job_type: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      sync_mode: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
      },
      current_phase: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      total_records: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      processed_records: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      created_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      updated_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      failed_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      skipped_count: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      },
      batch_size: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0,
      },
      last_completed_batch_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: -1,
      },
      last_completed_phase: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      client_reference: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      worker_id: {
        type: DataTypes.STRING(128),
        allowNull: true,
      },
      heartbeat_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lease_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      source_type: {
        type: DataTypes.STRING(32),
        allowNull: true,
      },
      source_uri: {
        type: DataTypes.STRING(512),
        allowNull: true,
      },
      error_summary: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      finished_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
      indexes: [
        { name: 'idx_integration_sync_jobs_tenant_status', fields: ['tenant_id', 'status'] },
        {
          name: 'idx_integration_sync_jobs_tenant_client_ref',
          fields: ['tenant_id', 'client_reference'],
        },
        {
          name: 'idx_integration_sync_jobs_tenant_idempotency',
          fields: ['tenant_id', 'idempotency_key'],
        },
        {
          name: 'uq_integration_sync_jobs_tenant_key_idempotency',
          unique: true,
          fields: ['tenant_id', 'api_key_id', 'idempotency_key'],
        },
      ],
    },
  );
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
function defineIntegrationSyncJobBatchModel(sequelize) {
  return sequelize.define(
    'integration_sync_job_batches',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      job_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
      phase: {
        type: DataTypes.STRING(16),
        allowNull: false,
      },
      batch_index: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'pending',
      },
      item_count: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0,
      },
      processed_count: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0,
      },
      failed_count: {
        type: DataTypes.SMALLINT,
        allowNull: false,
        defaultValue: 0,
      },
      errors: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      records: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      finished_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      freezeTableName: true,
      timestamps: false,
      indexes: [
        {
          name: 'uq_integration_sync_job_batches_job_phase_index',
          unique: true,
          fields: ['job_id', 'phase', 'batch_index'],
        },
        {
          name: 'idx_integration_sync_job_batches_job_phase_status',
          fields: ['job_id', 'phase', 'status'],
        },
      ],
    },
  );
}

/**
 * @param {import('sequelize').Sequelize} sequelize
 */
function defineIntegrationSyncJobEventModel(sequelize) {
  return sequelize.define(
    'integration_sync_job_events',
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      job_id: {
        type: DataTypes.CHAR(36),
        allowNull: false,
      },
      tenant_id: {
        type: DataTypes.STRING(64),
        allowNull: false,
      },
      event_type: {
        type: DataTypes.STRING(32),
        allowNull: false,
      },
      phase: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      batch_index: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      detail: {
        type: DataTypes.JSON,
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
        { name: 'idx_integration_sync_job_events_job_created', fields: ['job_id', 'created_at'] },
        { name: 'idx_integration_sync_job_events_tenant_created', fields: ['tenant_id', 'created_at'] },
      ],
    },
  );
}

module.exports = {
  SYNC_JOB_STATUSES,
  SYNC_JOB_TYPES,
  SYNC_MODES,
  SYNC_PHASES,
  BATCH_STATUSES,
  SYNC_EVENT_TYPES,
  ACTIVE_SYNC_JOB_STATUSES,
  SYNC_LEASE_DURATION_MS,
  SYNC_JOB_RETENTION_MS,
  SYNC_NOOP_WORKER_DELAY_MS,
  SYNC_WORKER_POLL_INTERVAL_MS,
  SYNC_PRODUCT_CHUNK_MAX,
  SYNC_PRICE_CHUNK_MAX,
  SYNC_STOCK_CHUNK_MAX,
  SYNC_MEDIA_CHUNK_MAX,
  SUPPORTED_CHUNK_PHASES,
  SYNC_PHASE_ORDER,
  defineIntegrationSyncJobModel,
  defineIntegrationSyncJobBatchModel,
  defineIntegrationSyncJobEventModel,
};
