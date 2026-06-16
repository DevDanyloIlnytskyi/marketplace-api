/** Domain error codes — no HTTP mapping in this layer. */
const PRICE_DOMAIN_ERROR = Object.freeze({
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRICE_NOT_FOUND: 'PRICE_NOT_FOUND',
  INVALID_PRICE: 'INVALID_PRICE',
  INVALID_ACTION_PRICE: 'INVALID_ACTION_PRICE',
  INVALID_PRODUCT_ID_BAS: 'INVALID_PRODUCT_ID_BAS',
});

const PRICE_DOMAIN_ERROR_MESSAGE = Object.freeze({
  [PRICE_DOMAIN_ERROR.PRODUCT_NOT_FOUND]: 'Product not found.',
  [PRICE_DOMAIN_ERROR.PRICE_NOT_FOUND]: 'Price not found.',
  [PRICE_DOMAIN_ERROR.INVALID_PRICE]: 'Price is invalid.',
  [PRICE_DOMAIN_ERROR.INVALID_ACTION_PRICE]: 'Action price is invalid.',
  [PRICE_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS]: 'Product id is invalid.',
});

class PriceDomainError extends Error {
  /**
   * @param {string} code
   * @param {{ message?: string, details?: unknown }} [options]
   */
  constructor(code, options = {}) {
    super(options.message || PRICE_DOMAIN_ERROR_MESSAGE[code] || code);
    this.name = 'PriceDomainError';
    this.code = code;
    this.details = options.details;
  }
}

/**
 * @param {string} code
 * @param {{ message?: string, details?: unknown }} [options]
 */
function createPriceDomainError(code, options = {}) {
  return new PriceDomainError(code, options);
}

function isPriceDomainError(error) {
  return error instanceof PriceDomainError;
}

module.exports = {
  PRICE_DOMAIN_ERROR,
  PRICE_DOMAIN_ERROR_MESSAGE,
  PriceDomainError,
  createPriceDomainError,
  isPriceDomainError,
};
