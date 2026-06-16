const stockService = require('../services/stock');
const { successResponse, notFoundError } = require('../../shared/integration/http');

async function getStockByProductIdBas(req, res) {
  const stock = await stockService.getStockByProductIdBas(
    req.models,
    req.params.productIdBas,
  );
  if (!stock) {
    throw notFoundError('Stock not found.');
  }
  return successResponse(res, req, stock);
}

module.exports = {
  getStockByProductIdBas,
};
