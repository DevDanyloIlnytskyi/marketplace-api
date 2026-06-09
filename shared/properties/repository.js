const { Op } = require('sequelize');

/**
 * Properties scoped to a category plus global properties (id_bas_category IS NULL).
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} idBasCategory
 */
async function findByCategoryIncludingGlobal(models, idBasCategory) {
  return models.Propertie.findAll({
    where: {
      [Op.or]: [
        { id_bas_category: null },
        { id_bas_category: idBasCategory },
      ],
    },
    order: [['name', 'ASC']],
  });
}

/**
 * Product characteristics for future product detail UI.
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} idBasProduct
 * @returns {Promise<Array<{ property: string, value: string | null }>>}
 */
async function getProductCharacteristics(models, idBasProduct) {
  const links = await models.Products_propertie.findAll({
    where: { id_bas_product: idBasProduct },
  });

  if (links.length === 0) {
    return [];
  }

  const propertyIds = [...new Set(links.map((link) => link.id_bas_property))];
  const properties = await models.Propertie.findAll({
    where: { id_bas: { [Op.in]: propertyIds } },
  });
  const nameByIdBas = new Map(properties.map((row) => [row.id_bas, row.name]));

  return links.map((link) => ({
    property: nameByIdBas.get(link.id_bas_property) ?? link.id_bas_property,
    value: link.value,
  }));
}

module.exports = {
  findByCategoryIncludingGlobal,
  getProductCharacteristics,
};
