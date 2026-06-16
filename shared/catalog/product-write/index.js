const {
  PRODUCT_DOMAIN_ERROR,
  PRODUCT_DOMAIN_ERROR_MESSAGE,
  ProductDomainError,
  createProductDomainError,
  isProductDomainError,
} = require('./product-write.errors');
const { validateUpsertProductInput } = require('./product-write.validation');
const { resolveCategory } = require('./category-resolver');
const { upsertProduct, buildCreatePayload, buildUpdatePatch } = require('./product-write.service');

module.exports = {
  PRODUCT_DOMAIN_ERROR,
  PRODUCT_DOMAIN_ERROR_MESSAGE,
  ProductDomainError,
  createProductDomainError,
  isProductDomainError,
  validateUpsertProductInput,
  resolveCategory,
  upsertProduct,
  buildCreatePayload,
  buildUpdatePatch,
};
