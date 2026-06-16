const { getTenantConnection } = require('../../shared/tenant/connection');
const { upsertStock } = require('../../shared/catalog/stock-write');
const { successResponse } = require('../../shared/integration/http');

/**
 * Map Integration HTTP body → domain input. productIdBas comes from URL only.
 * @param {import('express').Request['body']} body
 * @param {string} productIdBas
 * @returns {import('../../shared/catalog/stock-write/stock-write.types').UpsertStockInput}
 */
function mapUpsertStockBody(body, productIdBas) {
  return {
    productIdBas,
    quantity: body?.quantity,
  };
}

/**
 * PUT /api/integration/v1/stock/:productIdBas — HTTP adapter only (no business logic).
 */
async function upsertStockHandler(req, res) {
  const input = mapUpsertStockBody(req.body, req.params.productIdBas);
  const sequelize = getTenantConnection(req.tenant);
  const transaction = await sequelize.transaction();

  try {
    const result = await upsertStock(req.models, input, { transaction });
    await transaction.commit();

    return successResponse(res, req, {
      productIdBas: result.productIdBas,
      quantity: result.quantity,
      created: result.created,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  upsertStockHandler,
  mapUpsertStockBody,
};
