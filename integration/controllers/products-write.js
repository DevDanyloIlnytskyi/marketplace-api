const { getTenantConnection } = require('../../shared/tenant/connection');
const { upsertProduct } = require('../../shared/catalog/product-write');
const { successResponse } = require('../../shared/integration/http');

/**
 * Map Integration HTTP body → domain input. idBas comes from URL only.
 * @param {import('express').Request['body']} body
 * @param {string} idBas
 * @returns {import('../../shared/catalog/product-write/product-write.types').UpsertProductInput}
 */
function mapUpsertProductBody(body, idBas) {
  /** @type {import('../../shared/catalog/product-write/product-write.types').UpsertProductInput} */
  const input = {
    idBas,
    name: body?.name,
    categoryIdBas: body?.categoryIdBas,
  };

  if (body?.description !== undefined) {
    input.description = body.description;
  }
  if (body?.manufacturer !== undefined) {
    input.manufacturer = body.manufacturer;
  }
  if (body?.actual !== undefined) {
    input.actual = body.actual;
  }
  if (body && Object.prototype.hasOwnProperty.call(body, 'mainPhoto')) {
    input.mainPhoto = body.mainPhoto;
  }

  return input;
}

/**
 * PUT /api/integration/v1/products/:idBas — HTTP adapter only (no business logic).
 */
async function upsertProductHandler(req, res) {
  const input = mapUpsertProductBody(req.body, req.params.idBas);
  const sequelize = getTenantConnection(req.tenant);
  const transaction = await sequelize.transaction();

  try {
    const result = await upsertProduct(req.models, input, { transaction });
    await transaction.commit();

    return successResponse(res, req, {
      idBas: result.idBas,
      created: result.created,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  upsertProductHandler,
  mapUpsertProductBody,
};
