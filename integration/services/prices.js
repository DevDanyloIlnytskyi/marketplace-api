/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 */
async function getPriceByProductIdBas(models, productIdBas) {
  const row = await models.Products_price.findOne({
    where: { id_bas_product: productIdBas },
  });
  if (!row) {
    return null;
  }
  const plain = row.get({ plain: true });
  return {
    product_id_bas: plain.id_bas_product,
    price: plain.price,
    action_price: plain.action_price,
  };
}

module.exports = {
  getPriceByProductIdBas,
};
