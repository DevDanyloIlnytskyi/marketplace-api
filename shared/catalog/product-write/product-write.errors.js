/** Domain error codes — no HTTP mapping in this layer. */
const PRODUCT_DOMAIN_ERROR = Object.freeze({
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  INVALID_PRODUCT_NAME: 'INVALID_PRODUCT_NAME',
  INVALID_ID_BAS: 'INVALID_ID_BAS',
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_DESCRIPTION: 'INVALID_DESCRIPTION',
  INVALID_MANUFACTURER: 'INVALID_MANUFACTURER',
  INVALID_ACTUAL: 'INVALID_ACTUAL',
  INVALID_MAIN_PHOTO: 'INVALID_MAIN_PHOTO',
});

const PRODUCT_DOMAIN_ERROR_MESSAGE = Object.freeze({
  [PRODUCT_DOMAIN_ERROR.PRODUCT_NOT_FOUND]: 'Product not found.',
  [PRODUCT_DOMAIN_ERROR.CATEGORY_NOT_FOUND]: 'Category not found.',
  [PRODUCT_DOMAIN_ERROR.INVALID_PRODUCT_NAME]: 'Product name is invalid.',
  [PRODUCT_DOMAIN_ERROR.INVALID_ID_BAS]: 'Product id_bas is invalid.',
  [PRODUCT_DOMAIN_ERROR.INVALID_CATEGORY]: 'Category reference is invalid or missing.',
  [PRODUCT_DOMAIN_ERROR.INVALID_DESCRIPTION]: 'Product description exceeds maximum length.',
  [PRODUCT_DOMAIN_ERROR.INVALID_MANUFACTURER]: 'Manufacturer exceeds maximum length.',
  [PRODUCT_DOMAIN_ERROR.INVALID_ACTUAL]: 'Actual must be a boolean value.',
  [PRODUCT_DOMAIN_ERROR.INVALID_MAIN_PHOTO]: 'Main photo must be a string or null.',
});

class ProductDomainError extends Error {
  /**
   * @param {string} code
   * @param {{ message?: string, details?: unknown }} [options]
   */
  constructor(code, options = {}) {
    super(options.message || PRODUCT_DOMAIN_ERROR_MESSAGE[code] || code);
    this.name = 'ProductDomainError';
    this.code = code;
    this.details = options.details;
  }
}

/**
 * @param {string} code
 * @param {{ message?: string, details?: unknown }} [options]
 */
function createProductDomainError(code, options = {}) {
  return new ProductDomainError(code, options);
}

function isProductDomainError(error) {
  return error instanceof ProductDomainError;
}

module.exports = {
  PRODUCT_DOMAIN_ERROR,
  PRODUCT_DOMAIN_ERROR_MESSAGE,
  ProductDomainError,
  createProductDomainError,
  isProductDomainError,
};
