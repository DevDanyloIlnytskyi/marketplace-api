/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 */
async function getStockByProductIdBas(models, productIdBas) {
  const row = await models.Products_quantity.findOne({
    where: { id_bas_product: productIdBas },
  });
  if (!row) {
    return null;
  }
  const plain = row.get({ plain: true });
  return {
    product_id_bas: plain.id_bas_product,
    quantity: plain.quantity,
  };
}

module.exports = {
  getStockByProductIdBas,
};
