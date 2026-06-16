const {
  STOCK_DOMAIN_ERROR,
  STOCK_DOMAIN_ERROR_MESSAGE,
  StockDomainError,
  createStockDomainError,
  isStockDomainError,
} = require('./stock-write.errors');
const { validateUpsertStockInput } = require('./stock-write.validation');
const { upsertStock } = require('./stock-write.service');

module.exports = {
  STOCK_DOMAIN_ERROR,
  STOCK_DOMAIN_ERROR_MESSAGE,
  StockDomainError,
  createStockDomainError,
  isStockDomainError,
  validateUpsertStockInput,
  upsertStock,
};
