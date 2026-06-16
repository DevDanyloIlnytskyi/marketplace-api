/**
 * Stock persistence — Sequelize access isolated from domain service.
 */

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 */
function getStockModel(models) {
  return models.Products_quantity;
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findStockByProductIdBas(models, productIdBas, options = {}) {
  return getStockModel(models).findOne({
    where: { id_bas_product: productIdBas },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   id_bas_product: string,
 *   quantity: number,
 * }} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createStock(models, data, options = {}) {
  return getStockModel(models).create(
    {
      id_bas_product: data.id_bas_product,
      quantity: data.quantity,
    },
    { transaction: options.transaction },
  );
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {Record<string, unknown>} patch
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<number>} affected row count
 */
async function updateStockByProductIdBas(models, productIdBas, patch, options = {}) {
  const [affectedCount] = await getStockModel(models).update(patch, {
    where: { id_bas_product: productIdBas },
    transaction: options.transaction,
  });
  return affectedCount;
}

module.exports = {
  findStockByProductIdBas,
  createStock,
  updateStockByProductIdBas,
};
