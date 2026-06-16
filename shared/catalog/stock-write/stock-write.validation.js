const {
  STOCK_DOMAIN_ERROR,
  createStockDomainError,
} = require('./stock-write.errors');

const MAX_PRODUCT_ID_BAS_LENGTH = 255;

/**
 * @param {unknown} value
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {unknown} value
 */
function validateQuantityValue(value) {
  if (value === undefined || value === null) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_QUANTITY, {
      message: 'Quantity is required.',
    });
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_QUANTITY);
  }
  if (!Number.isInteger(value)) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_QUANTITY, {
      message: 'Quantity must be a whole number.',
    });
  }
  if (value < 0) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_QUANTITY, {
      message: 'Quantity must be greater than or equal to zero.',
    });
  }
}

/**
 * Validate upsert input — Express-independent.
 * @param {import('./stock-write.types').UpsertStockInput} input
 */
function validateUpsertStockInput(input) {
  if (!input || typeof input !== 'object') {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS, {
      message: 'Stock input is required.',
    });
  }

  if (!isNonEmptyString(input.productIdBas)) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS);
  }
  if (input.productIdBas.length > MAX_PRODUCT_ID_BAS_LENGTH) {
    throw createStockDomainError(STOCK_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS, {
      details: { maxLength: MAX_PRODUCT_ID_BAS_LENGTH },
    });
  }

  validateQuantityValue(input.quantity);
}

module.exports = {
  validateUpsertStockInput,
  validateQuantityValue,
  MAX_PRODUCT_ID_BAS_LENGTH,
};
