/**
 * Price persistence — Sequelize access isolated from domain service.
 */

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 */
function getPriceModel(models) {
  return models.Products_price;
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findPriceByProductIdBas(models, productIdBas, options = {}) {
  return getPriceModel(models).findOne({
    where: { id_bas_product: productIdBas },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   id_bas_product: string,
 *   price: number,
 *   action_price?: number | null,
 * }} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createPrice(models, data, options = {}) {
  return getPriceModel(models).create(
    {
      id_bas_product: data.id_bas_product,
      price: data.price,
      action_price: data.action_price ?? null,
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
async function updatePriceByProductIdBas(models, productIdBas, patch, options = {}) {
  const [affectedCount] = await getPriceModel(models).update(patch, {
    where: { id_bas_product: productIdBas },
    transaction: options.transaction,
  });
  return affectedCount;
}

module.exports = {
  findPriceByProductIdBas,
  createPrice,
  updatePriceByProductIdBas,
};
