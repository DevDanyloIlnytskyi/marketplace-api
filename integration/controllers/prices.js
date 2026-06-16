const priceService = require('../services/prices');
const { successResponse, notFoundError } = require('../../shared/integration/http');

async function getPriceByProductIdBas(req, res) {
  const price = await priceService.getPriceByProductIdBas(
    req.models,
    req.params.productIdBas,
  );
  if (!price) {
    throw notFoundError('Price not found.');
  }
  return successResponse(res, req, price);
}

module.exports = {
  getPriceByProductIdBas,
};
