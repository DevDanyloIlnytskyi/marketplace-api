const { normalizeMediaPathKey, buildProductGalleryPaths } = require('../../product/gallery-paths');
const { findProductByIdBas, updateProductByIdBas } = require('../product-repository');
const {
  findPhotosByProductIdBas,
  findGalleryRowByPhotoPath,
  createGalleryPhoto,
  deleteAllGalleryPhotos,
  deleteGalleryPhotoById,
  deleteGalleryPhotosByIds,
  bulkCreateGalleryPhotos,
  updateGalleryPhotoPath,
} = require('../media-repository');
const { createMediaDomainError, MEDIA_DOMAIN_ERROR } = require('./media-write.errors');
const {
  validateProductIdBas,
  requireValidPhotoPath,
  requireValidPhotoList,
} = require('./media-write.validation');

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {{ transaction?: import('sequelize').Transaction }} options
 */
async function requireProduct(models, productIdBas, options = {}) {
  const product = await findProductByIdBas(models, productIdBas, options);
  if (!product) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.PRODUCT_NOT_FOUND, {
      details: { productIdBas },
    });
  }
  return product;
}

/**
 * @param {import('sequelize').Model} product
 * @param {import('sequelize').Model[]} galleryRows
 */
function buildMediaResult(product, galleryRows) {
  const plain = product.get({ plain: true });
  const galleryPlain = galleryRows.map((row) => row.get({ plain: true }));
  const photos = buildProductGalleryPaths(plain.main_photo, galleryPlain);

  return {
    productIdBas: plain.id_bas,
    photos,
    mainPhoto: plain.main_photo ?? null,
    galleryCount: galleryPlain.length,
  };
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {string} productIdBas
 * @param {{ transaction?: import('sequelize').Transaction }} options
 */
async function loadMediaState(models, productIdBas, options = {}) {
  const product = await requireProduct(models, productIdBas, options);
  const galleryRows = await findPhotosByProductIdBas(models, productIdBas, options);
  return { product, galleryRows };
}

/**
 * @param {string | null | undefined} path
 */
function pathKey(path) {
  return normalizeMediaPathKey(path || '');
}

/**
 * Compute gallery diff for replacePhotoSet (in-memory, no I/O).
 *
 * @param {import('sequelize').Model[]} existingRows
 * @param {string | null} mainPhoto
 * @param {string[]} galleryPhotos normalized target gallery paths
 */
function computeGalleryDiff(existingRows, mainPhoto, galleryPhotos) {
  const mainKey = pathKey(mainPhoto);
  const targetGalleryKeys = new Set();
  /** @type {string[]} */
  const targetGalleryPaths = [];
  for (const photo of galleryPhotos) {
    const key = pathKey(photo);
    if (key && key !== mainKey && !targetGalleryKeys.has(key)) {
      targetGalleryKeys.add(key);
      targetGalleryPaths.push(photo);
    }
  }

  /** @type {number[]} */
  const toDeleteIds = [];
  /** @type {Map<string, { id: number, photo: string }>} */
  const existingByKey = new Map();

  for (const row of existingRows) {
    const plain = row.get({ plain: true });
    const key = pathKey(plain.photo);
    existingByKey.set(key, plain);
    const shouldKeep = targetGalleryKeys.has(key) && key !== mainKey;
    if (!shouldKeep) {
      toDeleteIds.push(plain.id);
    }
  }

  /** @type {Array<{ id_bas_product: string, photo: string }>} */
  const toInsert = [];
  for (const photo of targetGalleryPaths) {
    const key = pathKey(photo);
    if (!existingByKey.has(key)) {
      toInsert.push({ photo, key });
    }
  }

  return { toDeleteIds, toInsert, targetGalleryKeys, targetGalleryPaths, existingByKey };
}

/**
 * Full ERP photo set sync — first photo becomes main_photo, rest in products_photos.
 *
 * Optimized path: single gallery read, diff-based bulk delete/insert, no verification re-read.
 *
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./media-write.types').ReplacePhotoSetInput} input
 * @param {import('./media-write.types').MediaWriteOptions} [options]
 * @returns {Promise<import('./media-write.types').ReplacePhotoSetResult>}
 */
async function replacePhotoSet(models, input, options = {}) {
  validateProductIdBas(input.productIdBas);
  const productIdBas = input.productIdBas.trim();
  const photos = requireValidPhotoList(input.photos);
  const { transaction } = options;

  const product = await findProductByIdBas(models, productIdBas, { transaction });
  if (!product) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.PRODUCT_NOT_FOUND, {
      details: { productIdBas },
    });
  }

  const mainPhoto = photos[0] ?? null;
  const galleryPhotos = photos.slice(1);
  const productPlain = product.get({ plain: true });

  if (pathKey(productPlain.main_photo) !== pathKey(mainPhoto)) {
    await updateProductByIdBas(
      models,
      productIdBas,
      { main_photo: mainPhoto },
      { transaction },
    );
    productPlain.main_photo = mainPhoto;
    product.set('main_photo', mainPhoto);
  }

  const existingRows = await findPhotosByProductIdBas(models, productIdBas, { transaction });
  const { toDeleteIds, toInsert, targetGalleryKeys } = computeGalleryDiff(
    existingRows,
    mainPhoto,
    galleryPhotos,
  );

  if (toDeleteIds.length > 0) {
    await deleteGalleryPhotosByIds(models, toDeleteIds, { transaction });
  }

  const deleteIdSet = new Set(toDeleteIds);
  /** @type {import('sequelize').Model[]} */
  let galleryRows = existingRows.filter((row) => !deleteIdSet.has(row.get({ plain: true }).id));

  if (toInsert.length > 0) {
    const inserted = await bulkCreateGalleryPhotos(
      models,
      toInsert.map(({ photo }) => ({ id_bas_product: productIdBas, photo })),
      { transaction },
    );
    galleryRows = galleryRows.concat(inserted);
  }

  galleryRows.sort(
    (a, b) => a.get({ plain: true }).id - b.get({ plain: true }).id,
  );

  return buildMediaResult(product, galleryRows);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./media-write.types').AddPhotoInput} input
 * @param {import('./media-write.types').MediaWriteOptions} [options]
 */
async function addPhoto(models, input, options = {}) {
  validateProductIdBas(input.productIdBas);
  const productIdBas = input.productIdBas.trim();
  const photoPath = requireValidPhotoPath(input.photoPath);
  const { transaction } = options;

  const { product, galleryRows } = await loadMediaState(models, productIdBas, { transaction });
  const plain = product.get({ plain: true });
  const currentPhotos = buildProductGalleryPaths(plain.main_photo, galleryRows);

  if (currentPhotos.some((photo) => pathKey(photo) === pathKey(photoPath))) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.DUPLICATE_PHOTO, {
      details: { photoPath },
    });
  }

  if (!plain.main_photo) {
    await updateProductByIdBas(
      models,
      productIdBas,
      { main_photo: photoPath },
      { transaction },
    );
  } else {
    await createGalleryPhoto(
      models,
      { id_bas_product: productIdBas, photo: photoPath },
      { transaction },
    );
  }

  const state = await loadMediaState(models, productIdBas, { transaction });
  return buildMediaResult(state.product, state.galleryRows);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./media-write.types').ReplacePhotoInput} input
 * @param {import('./media-write.types').MediaWriteOptions} [options]
 */
async function replacePhoto(models, input, options = {}) {
  validateProductIdBas(input.productIdBas);
  const productIdBas = input.productIdBas.trim();
  const oldPhotoPath = requireValidPhotoPath(input.oldPhotoPath);
  const newPhotoPath = requireValidPhotoPath(input.newPhotoPath);
  const { transaction } = options;

  if (pathKey(oldPhotoPath) === pathKey(newPhotoPath)) {
    const state = await loadMediaState(models, productIdBas, { transaction });
    return buildMediaResult(state.product, state.galleryRows);
  }

  const { product, galleryRows } = await loadMediaState(models, productIdBas, { transaction });
  const plain = product.get({ plain: true });
  const currentPhotos = buildProductGalleryPaths(plain.main_photo, galleryRows);

  if (!currentPhotos.some((photo) => pathKey(photo) === pathKey(oldPhotoPath))) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.PHOTO_NOT_FOUND, {
      details: { photoPath: oldPhotoPath },
    });
  }

  if (currentPhotos.some((photo) => pathKey(photo) === pathKey(newPhotoPath))) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.DUPLICATE_PHOTO, {
      details: { photoPath: newPhotoPath },
    });
  }

  if (pathKey(plain.main_photo) === pathKey(oldPhotoPath)) {
    await updateProductByIdBas(
      models,
      productIdBas,
      { main_photo: newPhotoPath },
      { transaction },
    );
  } else {
    const updated = await updateGalleryPhotoPath(
      models,
      productIdBas,
      oldPhotoPath,
      newPhotoPath,
      { transaction },
    );
    if (updated === 0) {
      throw createMediaDomainError(MEDIA_DOMAIN_ERROR.PHOTO_NOT_FOUND, {
        details: { photoPath: oldPhotoPath },
      });
    }
  }

  const state = await loadMediaState(models, productIdBas, { transaction });
  return buildMediaResult(state.product, state.galleryRows);
}

/**
 * @param {ReturnType<import('../../tenant/model-registry').defineTenantModels>} models
 * @param {import('./media-write.types').RemovePhotoInput} input
 * @param {import('./media-write.types').MediaWriteOptions} [options]
 */
async function removePhoto(models, input, options = {}) {
  validateProductIdBas(input.productIdBas);
  const productIdBas = input.productIdBas.trim();
  const photoPath = requireValidPhotoPath(input.photoPath);
  const { transaction } = options;

  const { product, galleryRows } = await loadMediaState(models, productIdBas, { transaction });
  const plain = product.get({ plain: true });
  const currentPhotos = buildProductGalleryPaths(plain.main_photo, galleryRows);

  if (!currentPhotos.some((photo) => pathKey(photo) === pathKey(photoPath))) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.PHOTO_NOT_FOUND, {
      details: { photoPath },
    });
  }

  if (pathKey(plain.main_photo) === pathKey(photoPath)) {
    const firstGallery = galleryRows[0];
    const nextMainPath = firstGallery ? firstGallery.get({ plain: true }).photo : null;

    await updateProductByIdBas(
      models,
      productIdBas,
      { main_photo: nextMainPath },
      { transaction },
    );

    if (firstGallery) {
      await deleteGalleryPhotoById(models, firstGallery.get({ plain: true }).id, { transaction });
    }
  } else {
    const row = await findGalleryRowByPhotoPath(models, productIdBas, photoPath, { transaction });
    if (!row) {
      throw createMediaDomainError(MEDIA_DOMAIN_ERROR.PHOTO_NOT_FOUND, {
        details: { photoPath },
      });
    }
    await deleteGalleryPhotoById(models, row.get({ plain: true }).id, { transaction });
  }

  const state = await loadMediaState(models, productIdBas, { transaction });
  return buildMediaResult(state.product, state.galleryRows);
}

module.exports = {
  replacePhotoSet,
  addPhoto,
  replacePhoto,
  removePhoto,
  computeGalleryDiff,
};
