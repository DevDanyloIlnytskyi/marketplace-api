/** Domain error codes — no HTTP mapping in this layer. */
const STOCK_DOMAIN_ERROR = Object.freeze({
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  STOCK_NOT_FOUND: 'STOCK_NOT_FOUND',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_PRODUCT_ID_BAS: 'INVALID_PRODUCT_ID_BAS',
});

const STOCK_DOMAIN_ERROR_MESSAGE = Object.freeze({
  [STOCK_DOMAIN_ERROR.PRODUCT_NOT_FOUND]: 'Product not found.',
  [STOCK_DOMAIN_ERROR.STOCK_NOT_FOUND]: 'Stock not found.',
  [STOCK_DOMAIN_ERROR.INVALID_QUANTITY]: 'Quantity is invalid.',
  [STOCK_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS]: 'Product id is invalid.',
});

class StockDomainError extends Error {
  /**
   * @param {string} code
   * @param {{ message?: string, details?: unknown }} [options]
   */
  constructor(code, options = {}) {
    super(options.message || STOCK_DOMAIN_ERROR_MESSAGE[code] || code);
    this.name = 'StockDomainError';
    this.code = code;
    this.details = options.details;
  }
}

/**
 * @param {string} code
 * @param {{ message?: string, details?: unknown }} [options]
 */
function createStockDomainError(code, options = {}) {
  return new StockDomainError(code, options);
}

function isStockDomainError(error) {
  return error instanceof StockDomainError;
}

module.exports = {
  STOCK_DOMAIN_ERROR,
  STOCK_DOMAIN_ERROR_MESSAGE,
  StockDomainError,
  createStockDomainError,
  isStockDomainError,
};
