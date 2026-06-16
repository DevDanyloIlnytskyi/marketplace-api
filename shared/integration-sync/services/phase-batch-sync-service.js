const { SYNC_PHASE_ORDER } = require('../constants');
const { assertTransition } = require('../state-machine');
const {
  getJob,
  updateJob,
  completeJob,
  renewHeartbeat,
} = require('../repositories/job-repository');
const {
  claimBatchForProcessing,
  updateBatch,
  findNextUploadedBatch,
  resetStaleProcessingBatches,
  getExpectedBatchesFromMetadata,
  getPhaseCheckpointFromMetadata,
  mergePhaseCheckpointMetadata,
  countUploadedBatches,
} = require('../repositories/batch-repository');
const { processProductBatch } = require('../processors/product-batch-processor');
const { processPriceBatch } = require('../processors/price-batch-processor');
const { processStockBatch } = require('../processors/stock-batch-processor');
const { processMediaBatch } = require('../processors/media-batch-processor');
const {
  isPhaseComplete,
  isJobComplete,
  getActivePhasesFromJob,
  PRODUCT_PHASE,
  PRICE_PHASE,
  STOCK_PHASE,
  MEDIA_PHASE,
} = require('./chunk-upload-service');
const { recordEvent } = require('./event-service');

const PHASE_PROCESSORS = Object.freeze({
  products: processProductBatch,
  prices: processPriceBatch,
  stock: processStockBatch,
  media: processMediaBatch,
});

/**
 * Phases to process in order — registered on job or with uploaded batches.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} jobId
 * @param {import('sequelize').Model} job
 */
async function getPhasesToProcess(models, jobId, job) {
  /** @type {Set<string>} */
  const phases = new Set(getActivePhasesFromJob(job));

  for (const phase of SYNC_PHASE_ORDER) {
    const uploaded = await countUploadedBatches(models, jobId, phase);
    if (uploaded > 0) {
      phases.add(phase);
    }
  }

  return SYNC_PHASE_ORDER.filter((phase) => phases.has(phase));
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tenantId
 * @param {string} jobId
 * @param {string} workerId
 */
async function processUploadedBatches(models, sequelize, tenantId, jobId, workerId) {
  let job = await getJob(models, jobId);
  if (!job) {
    return false;
  }

  if (job.status === 'paused' || job.status === 'cancelled') {
    return false;
  }

  const phasesToProcess = await getPhasesToProcess(models, jobId, job);
  if (phasesToProcess.length === 0) {
    return false;
  }

  if (job.status === 'pending') {
    assertTransition(job.status, 'running');
    const now = new Date();
    await updateJob(models, jobId, {
      status: 'running',
      started_at: job.started_at || now,
      current_phase: phasesToProcess[0],
    });
    await recordEvent(models, {
      jobId,
      tenantId,
      eventType: 'job.started',
      detail: { workerId, phase: phasesToProcess[0] },
    });
    job = await getJob(models, jobId);
  }

  await resetStaleProcessingBatches(models, jobId);

  let processedAny = false;

  for (const phase of phasesToProcess) {
    job = await getJob(models, jobId);
    if (!job || job.status === 'cancelled' || job.status === 'paused') {
      return processedAny;
    }

    if (!(await isPhaseComplete(models, job, phase))) {
      const phaseProcessed = await processPhaseBatches(
        models,
        sequelize,
        tenantId,
        jobId,
        workerId,
        phase,
      );
      if (phaseProcessed) {
        processedAny = true;
      }
      job = await getJob(models, jobId);
      if (!job || job.status === 'cancelled' || job.status === 'paused') {
        return processedAny;
      }
    }
  }

  job = await getJob(models, jobId);
  if (job && (await isJobComplete(models, job))) {
    assertTransition(job.status, 'completed');
    await completeJob(models, jobId, { current_phase: 'done' });
    await recordEvent(models, {
      jobId,
      tenantId,
      eventType: 'job.completed',
      detail: { phases: await getPhasesToProcess(models, jobId, job) },
    });
  }

  return processedAny;
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 * @param {string} tenantId
 * @param {string} jobId
 * @param {string} workerId
 * @param {string} phase
 */
async function processPhaseBatches(models, sequelize, tenantId, jobId, workerId, phase) {
  const processor = PHASE_PROCESSORS[phase];
  if (!processor) {
    return false;
  }

  let job = await getJob(models, jobId);
  let processedAny = false;

  while (job) {
    await renewHeartbeat(models, jobId, workerId);

    const latest = await getJob(models, jobId);
    if (!latest || latest.status === 'cancelled' || latest.status === 'paused') {
      break;
    }
    job = latest;

    const checkpoint = getPhaseCheckpointFromMetadata(job.metadata, phase);
    const nextBatch = await findNextUploadedBatch(
      models,
      jobId,
      phase,
      checkpoint,
    );

    if (!nextBatch) {
      break;
    }

    const claimed = await claimBatchForProcessing(models, nextBatch.id);
    if (!claimed) {
      break;
    }

    const batchPlain = nextBatch.get({ plain: true });

    await recordEvent(models, {
      jobId,
      tenantId,
      eventType: 'batch.started',
      phase: batchPlain.phase,
      batchIndex: batchPlain.batch_index,
      detail: { workerId },
    });

    const result = await processor(models, sequelize, nextBatch);
    const finishedAt = new Date();

    await updateBatch(models, nextBatch.id, {
      status: result.batchStatus,
      processed_count: result.processedCount,
      failed_count: result.failedCount,
      errors: result.errors.length > 0 ? result.errors : null,
      finished_at: finishedAt,
    });

    const freshJob = await getJob(models, jobId);
    if (!freshJob) {
      break;
    }

    const metadata = mergePhaseCheckpointMetadata(
      freshJob.metadata,
      phase,
      batchPlain.batch_index,
      getExpectedBatchesFromMetadata(freshJob.metadata, phase),
    );

    await updateJob(models, jobId, {
      processed_records: (freshJob.processed_records || 0) + result.processedCount,
      created_count: (freshJob.created_count || 0) + result.createdCount,
      updated_count: (freshJob.updated_count || 0) + result.updatedCount,
      failed_count: (freshJob.failed_count || 0) + result.failedCount,
      last_completed_batch_index: batchPlain.batch_index,
      last_completed_phase: phase,
      current_phase: phase,
      metadata,
    });

    const eventType = result.batchStatus === 'failed' ? 'batch.failed' : 'batch.completed';
    await recordEvent(models, {
      jobId,
      tenantId,
      eventType,
      phase: batchPlain.phase,
      batchIndex: batchPlain.batch_index,
      detail: {
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        batchStatus: result.batchStatus,
      },
    });

    processedAny = true;
    job = await getJob(models, jobId);

    if (job && (await isPhaseComplete(models, job, phase))) {
      await recordEvent(models, {
        jobId,
        tenantId,
        eventType: 'phase.completed',
        phase,
        detail: {
          expectedBatches: getExpectedBatchesFromMetadata(job.metadata, phase),
        },
      });

      if (job.job_type === phase) {
        break;
      }
    }
  }

  return processedAny;
}

/** @deprecated Use processUploadedBatches */
const processUploadedProductBatches = processUploadedBatches;

module.exports = {
  processUploadedBatches,
  processUploadedProductBatches,
  processPhaseBatches,
  getPhasesToProcess,
  PRODUCT_PHASE,
  PRICE_PHASE,
  STOCK_PHASE,
  MEDIA_PHASE,
};
