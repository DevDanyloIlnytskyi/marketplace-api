const { validateUpsertStockInput } = require('./stock-write.validation');
const { createStockDomainError, STOCK_DOMAIN_ERROR } = require('./stock-write.errors');
const { findProductByIdBas } = require('../product-repository');
const {
  findStockByProductIdBas,
  createStock,
  updateStockByProductIdBas,
} = require('../stock-repository');

/**
 * Upsert stock by product id_bas — pure domain operation (no HTTP).
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./stock-write.types').UpsertStockInput} input
 * @param {import('./stock-write.types').UpsertStockOptions} [options]
 * @returns {Promise<import('./stock-write.types').UpsertStockResult>}
 */
async function upsertStock(models, input, options = {}) {
  validateUpsertStockInput(input);

  const { transaction } = options;
  const productIdBas = input.productIdBas.trim();

  const product = await findProductByIdBas(models, productIdBas, { transaction });
  if (!product) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.PRODUCT_NOT_FOUND, {
      details: { productIdBas },
    });
  }

  const existing = await findStockByProductIdBas(models, productIdBas, { transaction });

  if (existing) {
    await updateStockByProductIdBas(
      models,
      productIdBas,
      { quantity: input.quantity },
      { transaction },
    );

    const refreshed = await findStockByProductIdBas(models, productIdBas, { transaction });
    const plain = refreshed.get({ plain: true });

    return {
      productIdBas: plain.id_bas_product,
      quantity: plain.quantity,
      created: false,
    };
  }

  const created = await createStock(
    models,
    {
      id_bas_product: productIdBas,
      quantity: input.quantity,
    },
    { transaction },
  );
  const plain = created.get({ plain: true });

  return {
    productIdBas: plain.id_bas_product,
    quantity: plain.quantity,
    created: true,
  };
}

module.exports = {
  upsertStock,
};
