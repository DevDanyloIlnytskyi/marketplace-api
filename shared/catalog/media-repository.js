/**
 * Media persistence — Sequelize access isolated from domain service.
 */

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 */
function getPhotoModel(models) {
  return models.Products_photo;
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findPhotosByProductIdBas(models, productIdBas, options = {}) {
  return getPhotoModel(models).findAll({
    where: { id_bas_product: productIdBas },
    order: [['id', 'ASC']],
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {string} photoPath
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function findGalleryRowByPhotoPath(models, productIdBas, photoPath, options = {}) {
  return getPhotoModel(models).findOne({
    where: {
      id_bas_product: productIdBas,
      photo: photoPath,
    },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {{
 *   id_bas_product: string,
 *   photo: string,
 * }} data
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function createGalleryPhoto(models, data, options = {}) {
  return getPhotoModel(models).create(
    {
      id_bas_product: data.id_bas_product,
      photo: data.photo,
    },
    { transaction: options.transaction },
  );
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function deleteAllGalleryPhotos(models, productIdBas, options = {}) {
  return getPhotoModel(models).destroy({
    where: { id_bas_product: productIdBas },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {number} id
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function deleteGalleryPhotoById(models, id, options = {}) {
  return getPhotoModel(models).destroy({
    where: { id },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {number[]} ids
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function deleteGalleryPhotosByIds(models, ids, options = {}) {
  if (!ids.length) {
    return 0;
  }
  return getPhotoModel(models).destroy({
    where: { id: ids },
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {Array<{ id_bas_product: string, photo: string }>} rows
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function bulkCreateGalleryPhotos(models, rows, options = {}) {
  if (!rows.length) {
    return [];
  }
  return getPhotoModel(models).bulkCreate(rows, {
    transaction: options.transaction,
  });
}

/**
 * @param {ReturnType<import('../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {string} oldPhotoPath
 * @param {string} newPhotoPath
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function updateGalleryPhotoPath(models, productIdBas, oldPhotoPath, newPhotoPath, options = {}) {
  const [count] = await getPhotoModel(models).update(
    { photo: newPhotoPath },
    {
      where: {
        id_bas_product: productIdBas,
        photo: oldPhotoPath,
      },
      transaction: options.transaction,
    },
  );
  return count;
}

module.exports = {
  findPhotosByProductIdBas,
  findGalleryRowByPhotoPath,
  createGalleryPhoto,
  deleteAllGalleryPhotos,
  deleteGalleryPhotoById,
  deleteGalleryPhotosByIds,
  bulkCreateGalleryPhotos,
  updateGalleryPhotoPath,
};
