const { replacePhotoSet, isMediaDomainError } = require('../../catalog/media-write');
const { mapChunkRecordToMediaInput } = require('./media-record-mapper');

/**
 * Process one media batch — per-record transactions (no savepoint overhead).
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').Model} batch
 */
async function processMediaBatch(models, sequelize, batch) {
  const plain = batch.get({ plain: true });
  const records = Array.isArray(plain.records) ? plain.records : [];

  /** @type {Array<{ productIdBas: string, code: string, message: string }>} */
  const errors = [];
  let processedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  for (const record of records) {
    const productIdBas =
      String(record?.productIdBas || record?.idBas || '').trim() || 'unknown';
    const transaction = await sequelize.transaction();

    try {
      const input = mapChunkRecordToMediaInput(record);
      await replacePhotoSet(models, input, { transaction });
      await transaction.commit();

      processedCount += 1;
      updatedCount += 1;
    } catch (error) {
      await transaction.rollback();
      failedCount += 1;

      if (isMediaDomainError(error)) {
        errors.push({
          productIdBas,
          code: error.code,
          message: error.message,
        });
      } else {
        errors.push({
          productIdBas,
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  let batchStatus = 'completed';
  if (failedCount > 0 && processedCount === 0) {
    batchStatus = 'failed';
  } else if (failedCount > 0) {
    batchStatus = 'completed_with_errors';
  }

  return {
    processedCount,
    createdCount,
    updatedCount,
    failedCount,
    errors,
    batchStatus,
  };
}

module.exports = {
  processMediaBatch,
};
