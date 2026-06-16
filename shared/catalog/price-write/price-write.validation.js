const {
  PRICE_DOMAIN_ERROR,
  createPriceDomainError,
} = require('./price-write.errors');

const MAX_PRODUCT_ID_BAS_LENGTH = 255;

/**
 * @param {unknown} value
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate monetary field — integer, finite, ≥ 0 (stored as INT in DB).
 * @param {unknown} value
 * @param {string} errorCode
 */
function validateMonetaryValue(value, errorCode) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createPriceDomainError(errorCode);
  }
  if (value < 0) {
    throw createPriceDomainError(errorCode, {
      message: 'Price must be greater than or equal to zero.',
    });
  }
  if (!Number.isInteger(value)) {
    throw createPriceDomainError(errorCode, {
      message: 'Price must be a whole number (integer UAH units).',
    });
  }
}

/**
 * Validate upsert input — Express-independent.
 * @param {import('./price-write.types').UpsertPriceInput} input
 */
function validateUpsertPriceInput(input) {
  if (!input || typeof input !== 'object') {
    throw createPriceDomainError(PRICE_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS, {
      message: 'Price input is required.',
    });
  }

  if (!isNonEmptyString(input.productIdBas)) {
    throw createPriceDomainError(PRICE_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS);
  }
  if (input.productIdBas.length > MAX_PRODUCT_ID_BAS_LENGTH) {
    throw createPriceDomainError(PRICE_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS, {
      details: { maxLength: MAX_PRODUCT_ID_BAS_LENGTH },
    });
  }

  if (input.price === undefined || input.price === null) {
    throw createPriceDomainError(PRICE_DOMAIN_ERROR.INVALID_PRICE, {
      message: 'Price is required.',
    });
  }
  validateMonetaryValue(input.price, PRICE_DOMAIN_ERROR.INVALID_PRICE);

  if (input.actionPrice !== undefined && input.actionPrice !== null) {
    validateMonetaryValue(input.actionPrice, PRICE_DOMAIN_ERROR.INVALID_ACTION_PRICE);
  }
}

module.exports = {
  validateUpsertPriceInput,
  validateMonetaryValue,
  MAX_PRODUCT_ID_BAS_LENGTH,
};
