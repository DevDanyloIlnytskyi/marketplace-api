/**
 * Category lookup helpers for catalog write domain.
 */

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 */
function getCategoryModel(models) {
  return models.Category;
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {number} categoryId
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findCategoryById(models, categoryId, options = {}) {
  return getCategoryModel(models).findByPk(categoryId, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} idBas
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findCategoryByIdBas(models, idBas, options = {}) {
  return getCategoryModel(models).findOne({
    where: { id_bas: idBas },
    transaction: options.transaction,
  });
}

module.exports = {
  findCategoryById,
  findCategoryByIdBas,
};
