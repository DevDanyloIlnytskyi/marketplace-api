const { getTenantConnection } = require('../../shared/tenant/connection');
const { replacePhotoSet } = require('../../shared/catalog/media-write');
const { successResponse } = require('../../shared/integration/http');

/**
 * Map Integration HTTP body → domain input. productIdBas comes from URL only.
 * @param {import('express').Request['body']} body
 * @param {string} productIdBas
 * @returns {import('../../shared/catalog/media-write/media-write.types').ReplacePhotoSetInput}
 */
function mapReplacePhotoSetBody(body, productIdBas) {
  return {
    productIdBas,
    photos: body?.photos ?? [],
  };
}

/**
 * PUT /api/integration/v1/products/:productIdBas/media — HTTP adapter only.
 */
async function replacePhotoSetHandler(req, res) {
  const input = mapReplacePhotoSetBody(req.body, req.params.productIdBas);
  const sequelize = getTenantConnection(req.tenant);
  const transaction = await sequelize.transaction();

  try {
    const result = await replacePhotoSet(req.models, input, { transaction });
    await transaction.commit();

    return successResponse(res, req, {
      productIdBas: result.productIdBas,
      photos: result.photos,
      mainPhoto: result.mainPhoto,
      galleryCount: result.galleryCount,
    });
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  replacePhotoSetHandler,
  mapReplacePhotoSetBody,
};
