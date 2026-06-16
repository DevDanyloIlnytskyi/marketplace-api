const productService = require('../services/products');
const { successResponse, notFoundError } = require('../../shared/integration/http');

async function listProducts(req, res) {
  const data = await productService.listProducts(req.models, {
    category_id_bas: req.query.category_id_bas,
    cursor: req.query.cursor,
    limit: req.query.limit,
  });
  return successResponse(res, req, data);
}

async function getProductByIdBas(req, res) {
  const product = await productService.getProductByIdBas(
    req.models,
    req.params.idBas,
  );
  if (!product) {
    throw notFoundError('Product not found.');
  }
  return successResponse(res, req, product);
}

module.exports = {
  listProducts,
  getProductByIdBas,
};
