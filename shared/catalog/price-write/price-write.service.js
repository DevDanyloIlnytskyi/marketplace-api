const { validateUpsertPriceInput } = require('./price-write.validation');
const { createPriceDomainError, PRICE_DOMAIN_ERROR } = require('./price-write.errors');
const { findProductByIdBas } = require('../product-repository');
const {
  findPriceByProductIdBas,
  createPrice,
  updatePriceByProductIdBas,
} = require('../price-repository');

/**
 * @param {import('./price-write.types').UpsertPriceInput} input
 * @returns {Record<string, unknown>}
 */
function buildCreatePayload(input) {
  /** @type {Record<string, unknown>} */
  const payload = {
    id_bas_product: input.productIdBas.trim(),
    price: input.price,
  };

  if (input.actionPrice === undefined) {
    payload.action_price = null;
  } else if (input.actionPrice === null) {
    payload.action_price = null;
  } else {
    payload.action_price = input.actionPrice;
  }

  return payload;
}

/**
 * @param {import('./price-write.types').UpsertPriceInput} input
 * @returns {Record<string, unknown>}
 */
function buildUpdatePatch(input) {
  /** @type {Record<string, unknown>} */
  const patch = {
    price: input.price,
  };

  if (input.actionPrice === undefined) {
    // Preserve existing action_price on partial update.
  } else if (input.actionPrice === null) {
    patch.action_price = null;
  } else {
    patch.action_price = input.actionPrice;
  }

  return patch;
}

/**
 * Upsert price by product id_bas — pure domain operation (no HTTP).
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./price-write.types').UpsertPriceInput} input
 * @param {import('./price-write.types').UpsertPriceOptions} [options]
 * @returns {Promise<import('./price-write.types').UpsertPriceResult>}
 */
async function upsertPrice(models, input, options = {}) {
  validateUpsertPriceInput(input);

  const { transaction } = options;
  const productIdBas = input.productIdBas.trim();

  const product = await findProductByIdBas(models, productIdBas, { transaction });
  if (!product) {
    throw createPriceDomainError(PRICE_DOMAIN_ERROR.PRODUCT_NOT_FOUND, {
      details: { productIdBas },
    });
  }

  const existing = await findPriceByProductIdBas(models, productIdBas, { transaction });

  if (existing) {
    const patch = buildUpdatePatch(input);
    await updatePriceByProductIdBas(models, productIdBas, patch, { transaction });

    const refreshed = await findPriceByProductIdBas(models, productIdBas, { transaction });
    const plain = refreshed.get({ plain: true });

    return {
      productIdBas: plain.id_bas_product,
      price: plain.price,
      actionPrice: plain.action_price ?? null,
      created: false,
    };
  }

  const createPayload = buildCreatePayload(input);
  const created = await createPrice(models, createPayload, { transaction });
  const plain = created.get({ plain: true });

  return {
    productIdBas: plain.id_bas_product,
    price: plain.price,
    actionPrice: plain.action_price ?? null,
    created: true,
  };
}

module.exports = {
  upsertPrice,
  buildCreatePayload,
  buildUpdatePatch,
};
