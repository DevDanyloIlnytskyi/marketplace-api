const {
  PRODUCT_DOMAIN_ERROR,
  createProductDomainError,
} = require('./product-write.errors');

const MAX_ID_BAS_LENGTH = 255;
const MAX_NAME_LENGTH = 255;
const MAX_MANUFACTURER_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 65535;

/**
 * @param {unknown} value
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate upsert input — Express-independent.
 * @param {import('./product-write.types').UpsertProductInput} input
 */
function validateUpsertProductInput(input) {
  if (!input || typeof input !== 'object') {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_ID_BAS, {
      message: 'Product input is required.',
    });
  }

  if (!isNonEmptyString(input.idBas)) {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_ID_BAS);
  }
  if (input.idBas.length > MAX_ID_BAS_LENGTH) {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_ID_BAS, {
      details: { maxLength: MAX_ID_BAS_LENGTH },
    });
  }

  if (!isNonEmptyString(input.name)) {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_PRODUCT_NAME);
  }
  if (input.name.length > MAX_NAME_LENGTH) {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_PRODUCT_NAME, {
      details: { maxLength: MAX_NAME_LENGTH },
    });
  }

  const hasCategoryId =
    input.categoryId !== undefined &&
    input.categoryId !== null &&
    input.categoryId !== '';
  const hasCategoryIdBas = isNonEmptyString(input.categoryIdBas);

  if (!hasCategoryId && !hasCategoryIdBas) {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_CATEGORY, {
      message: 'Either categoryId or categoryIdBas is required.',
    });
  }

  if (hasCategoryId) {
    const parsed = Number(input.categoryId);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_CATEGORY, {
        message: 'categoryId must be a positive integer.',
      });
    }
  }

  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_DESCRIPTION);
    }
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_DESCRIPTION, {
        details: { maxLength: MAX_DESCRIPTION_LENGTH },
      });
    }
  }

  if (input.manufacturer !== undefined && input.manufacturer !== null) {
    if (typeof input.manufacturer !== 'string') {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_MANUFACTURER);
    }
    if (input.manufacturer.length > MAX_MANUFACTURER_LENGTH) {
      throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_MANUFACTURER, {
        details: { maxLength: MAX_MANUFACTURER_LENGTH },
      });
    }
  }

  if (input.actual !== undefined && typeof input.actual !== 'boolean') {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_ACTUAL);
  }

  if (
    input.mainPhoto !== undefined &&
    input.mainPhoto !== null &&
    typeof input.mainPhoto !== 'string'
  ) {
    throw createProductDomainError(PRODUCT_DOMAIN_ERROR.INVALID_MAIN_PHOTO);
  }
}

module.exports = {
  validateUpsertProductInput,
  MAX_ID_BAS_LENGTH,
  MAX_NAME_LENGTH,
};
