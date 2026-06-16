const catalogService = require('../services/catalog');
const { successResponse, notFoundError } = require('../../shared/integration/http');

async function getCatalog(req, res) {
  const data = await catalogService.getCatalog(req, {
    cursor: req.query.cursor,
    limit: req.query.limit,
  });

  if (req.query.id_bas) {
    if (!data) {
      throw notFoundError('Catalog item not found.');
    }
    return successResponse(res, req, data);
  }

  return successResponse(res, req, data);
}

module.exports = {
  getCatalog,
};
