const {
  PRODUCT_DOMAIN_ERROR,
  createProductDomainError,
} = require('./product-write.errors');
const { findCategoryById, findCategoryByIdBas } = require('../category-repository');

/**
 * Resolve category reference to internal categories.id.
 *
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {import('./product-write.types').ResolveCategoryInput} input
 * @param {import('./product-write.types').ResolveCategoryOptions} [options]
 * @returns {Promise<number>} categories.id
 */
async function resolveCategory(models, input, options = {}) {
  const { transaction } = options;

  if (
    input.categoryId !== undefined &&
    input.categoryId !== null &&
    input.categoryId !== ''
  ) {
    const categoryId = Number(input.categoryId);
    const category = await findCategoryById(models, categoryId, { transaction });
    if (!category) {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.CATEGORY_NOT_FOUND, {
        details: { categoryId },
      });
    }
    return category.id;
  }

  if (input.categoryIdBas && String(input.categoryIdBas).trim()) {
    const category = await findCategoryByIdBas(models, String(input.categoryIdBas).trim(), {
      transaction,
    });
    if (!category) {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.CATEGORY_NOT_FOUND, {
        details: { categoryIdBas: input.categoryIdBas },
      });
    }
    return category.id;
  }

  throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_CATEGORY, {
    message: 'Either categoryId or categoryIdBas is required.',
  });
}

module.exports = {
  resolveCategory,
};
