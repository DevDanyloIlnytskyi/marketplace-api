const categoryService = require('../services/categories');
const { successResponse, notFoundError } = require('../../shared/integration/http');

async function listCategories(req, res) {
  const parentIdBas = req.query.parent_id_bas;
  const data = await categoryService.listCategories(req.models, {
    parent_id_bas: parentIdBas,
    cursor: req.query.cursor,
    limit: req.query.limit,
  });
  return successResponse(res, req, data);
}

async function getCategoryByIdBas(req, res) {
  const category = await categoryService.getCategoryByIdBas(
    req.models,
    req.params.idBas,
  );
  if (!category) {
    throw notFoundError('Category not found.');
  }
  return successResponse(res, req, category);
}

module.exports = {
  listCategories,
  getCategoryByIdBas,
};
