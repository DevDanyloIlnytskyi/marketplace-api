const { validateUpsertProductInput } = require('./product-write.validation');
const { resolveCategory } = require('./category-resolver');
const {
  findProductByIdBas,
  createProduct,
  updateProductByIdBas,
} = require('../product-repository');

/**
 * Build Sequelize update patch with main_photo semantics:
 * - undefined → omit field (preserve existing)
 * - null      → clear field
 * - string    → set field
 *
 * @param {import('./product-write.types').UpsertProductInput} input
 * @param {number} categoriesId
 * @returns {Record<string, unknown>}
 */
function buildCreatePayload(input, categoriesId) {
  /** @type {Record<string, unknown>} */
  const payload = {
    id_bas: input.idBas.trim(),
    name: input.name.trim(),
    description: input.description ?? null,
    categories_id: categoriesId,
    actual: input.actual !== undefined ? input.actual : true,
    manufacturer: input.manufacturer ?? null,
  };

  if (input.mainPhoto === undefined) {
    payload.main_photo = null;
  } else if (input.mainPhoto === null) {
    payload.main_photo = null;
  } else {
    payload.main_photo = input.mainPhoto;
  }

  return payload;
}

/**
 * @param {import('./product-write.types').UpsertProductInput} input
 * @param {number} categoriesId
 * @returns {Record<string, unknown>}
 */
function buildUpdatePatch(input, categoriesId) {
  /** @type {Record<string, unknown>} */
  const patch = {
    name: input.name.trim(),
    description: input.description ?? null,
    categories_id: categoriesId,
    actual: input.actual !== undefined ? input.actual : true,
    manufacturer: input.manufacturer ?? null,
  };

  if (input.mainPhoto === undefined) {
    // Intentionally omit main_photo — fixes legacy bug that cleared photo on JSON update.
  } else if (input.mainPhoto === null) {
    patch.main_photo = null;
  } else {
    patch.main_photo = input.mainPhoto;
  }

  return patch;
}

/**
 * Upsert product by id_bas — pure domain operation (no HTTP).
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./product-write.types').UpsertProductInput} input
 * @param {import('./product-write.types').UpsertProductOptions} [options]
 * @returns {Promise<import('./product-write.types').UpsertProductResult>}
 */
async function upsertProduct(models, input, options = {}) {
  validateUpsertProductInput(input);

  const { transaction } = options;
  const categoriesId = await resolveCategory(
    models,
    {
      categoryId: input.categoryId,
      categoryIdBas: input.categoryIdBas,
    },
    { transaction },
  );

  const existing = await findProductByIdBas(models, input.idBas.trim(), { transaction });

  if (existing) {
    const patch = buildUpdatePatch(input, categoriesId);
    await updateProductByIdBas(models, input.idBas.trim(), patch, { transaction });

    const refreshed = await findProductByIdBas(models, input.idBas.trim(), { transaction });
    const plain = refreshed.get({ plain: true });

    return {
      idBas: plain.id_bas,
      id: plain.id,
      created: false,
      mainPhoto: plain.main_photo ?? null,
    };
  }

  const createPayload = buildCreatePayload(input, categoriesId);
  const created = await createProduct(models, createPayload, { transaction });
  const plain = created.get({ plain: true });

  return {
    idBas: plain.id_bas,
    id: plain.id,
    created: true,
    mainPhoto: plain.main_photo ?? null,
  };
}

module.exports = {
  upsertProduct,
  buildCreatePayload,
  buildUpdatePatch,
};
