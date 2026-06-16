const { upsertProduct, isProductDomainError } = require('../../catalog/product-write');
const { mapChunkRecordToProductInput } = require('./product-record-mapper');

/**
 * Process one product batch inside a single DB transaction with per-record savepoints.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Sequelize} sequelize
 * @param {import('sequelize').Model} batch
 */
async function processProductBatch(models, sequelize, batch) {
  const plain = batch.get({ plain: true });
  const records = Array.isArray(plain.records) ? plain.records : [];

  /** @type {Array<{ idBas: string, code: string, message: string }>} */
  const errors = [];
  let processedCount = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let failedCount = 0;

  const transaction = await sequelize.transaction();

  try {
    for (const record of records) {
      const idBas = String(record?.idBas || '').trim() || 'unknown';
      const savepoint = await sequelize.transaction({ transaction });

      try {
        const input = mapChunkRecordToProductInput(record);
        const result = await upsertProduct(models, input, { transaction: savepoint });
        await savepoint.commit();

        processedCount += 1;
        if (result.created) {
          createdCount += 1;
        } else {
          updatedCount += 1;
        }
      } catch (error) {
        await savepoint.rollback();
        failedCount += 1;

        if (isProductDomainError(error)) {
          errors.push({
            idBas,
            code: error.code,
            message: error.message,
          });
        } else {
          errors.push({
            idBas,
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
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
  processProductBatch,
};
