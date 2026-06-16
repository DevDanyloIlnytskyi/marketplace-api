const { getTenantConnection } = require('../../shared/tenant/connection');
const { upsertPrice } = require('../../shared/catalog/price-write');
const { successResponse } = require('../../shared/integration/http');

/**
 * Map Integration HTTP body → domain input. productIdBas comes from URL only.
 * @param {import('express').Request['body']} body
 * @param {string} productIdBas
 * @returns {import('../../shared/catalog/price-write/price-write.types').UpsertPriceInput}
 */
function mapUpsertPriceBody(body, productIdBas) {
  /** @type {import('../../shared/catalog/price-write/price-write.types').UpsertPriceInput} */
  const input = {
    productIdBas,
    price: body?.price,
  };

  if (body && Object.prototype.hasOwnProperty.call(body, 'actionPrice')) {
    input.actionPrice = body.actionPrice;
  }

  return input;
}

/**
 * PUT /api/integration/v1/prices/:productIdBas — HTTP adapter only (no business logic).
 */
async function upsertPriceHandler(req, res) {
  const input = mapUpsertPriceBody(req.body, req.params.productIdBas);
  const sequelize = getTenantConnection(req.tenant);
  const transaction = await sequelize.transaction();

  try {
    const result = await upsertPrice(req.models, input, { transaction });
    await transaction.commit();

    return successResponse(res, req, {
      productIdBas: result.productIdBas,
      price: result.price,
      created: result.created,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  upsertPriceHandler,
  mapUpsertPriceBody,
};
