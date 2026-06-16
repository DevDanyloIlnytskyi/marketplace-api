/**
 * Product persistence — Sequelize access isolated from domain service.
 */

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 */
function getProductModel(models) {
  return models.Product;
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} idBas
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findProductByIdBas(models, idBas, options = {}) {
  return getProductModel(models).findOne({
    where: { id_bas: idBas },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {number} id
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findProductById(models, id, options = {}) {
  return getProductModel(models).findByPk(id, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   id_bas: string,
 *   name: string,
 *   description?: string | null,
 *   categories_id: number,
 *   actual: boolean,
 *   manufacturer?: string | null,
 *   main_photo?: string | null,
 * }} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createProduct(models, data, options = {}) {
  return getProductModel(models).create(
    {
      id_bas: data.id_bas,
      name: data.name,
      description: data.description ?? null,
      categories_id: data.categories_id,
      actual: data.actual,
      manufacturer: data.manufacturer ?? null,
      main_photo: data.main_photo ?? null,
    },
    { transaction: options.transaction },
  );
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} idBas
 * @param {Record<string, unknown>} patch
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 * @returns {Promise<number>} affected row count
 */
async function updateProductByIdBas(models, idBas, patch, options = {}) {
  const [affectedCount] = await getProductModel(models).update(patch, {
    where: { id_bas: idBas },
    transaction: options.transaction,
  });
  return affectedCount;
}

module.exports = {
  findProductByIdBas,
  findProductById,
  createProduct,
  updateProductByIdBas,
};
