/**
 * Platform-5.8 — Media Write Domain smoke / validation script.
 *
 * Usage:
 *   node scripts/media-write-domain-smoke.js
 */
require('dotenv').config();

const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const {
  replacePhotoSet,
  addPhoto,
  removePhoto,
  replacePhoto,
  isMediaDomainError,
  MEDIA_DOMAIN_ERROR,
  requireValidPhotoList,
} = require('../shared/catalog/media-write');
const { findPhotosByProductIdBas } = require('../shared/catalog/media-repository');
const { findProductByIdBas } = require('../shared/catalog/product-repository');

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const TEST_PRODUCT_ID_BAS = `pw58-smoke-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  try {
    requireValidPhotoList(['products/a.webp', 'products/a.webp']);
    throw new Error('expected DUPLICATE_PHOTO');
  } catch (error) {
    assert(
      isMediaDomainError(error) && error.code === MEDIA_DOMAIN_ERROR.DUPLICATE_PHOTO,
      'duplicate photo list',
    );
  }
  console.log('validation layer: ok');

  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);

  const product = await models.Product.findOne({ order: [['id', 'ASC']] });
  if (!product) {
    throw new Error('No product in tenant DB');
  }
  const productIdBas = product.id_bas;

  await models.Products_photo.destroy({ where: { id_bas_product: productIdBas } });

  const synced = await replacePhotoSet(models, {
    productIdBas,
    photos: ['products/smoke-a.webp', 'products/smoke-b.webp', 'products/smoke-c.webp'],
  });
  assert(synced.mainPhoto === 'products/smoke-a.webp', 'first photo is main');
  assert(synced.photos.length === 3, 'three photos in gallery view');
  assert(synced.galleryCount === 2, 'two gallery rows');
  console.log('replace photo set: ok');

  const added = await addPhoto(models, {
    productIdBas,
    photoPath: 'products/smoke-d.webp',
  });
  assert(added.photos.includes('products/smoke-d.webp'), 'addPhoto appended');
  console.log('add photo: ok');

  const replaced = await replacePhoto(models, {
    productIdBas,
    oldPhotoPath: 'products/smoke-b.webp',
    newPhotoPath: 'products/smoke-b2.webp',
  });
  assert(replaced.photos.includes('products/smoke-b2.webp'), 'replacePhoto updated path');
  console.log('replace photo: ok');

  const removed = await removePhoto(models, {
    productIdBas,
    photoPath: 'products/smoke-c.webp',
  });
  assert(!removed.photos.includes('products/smoke-c.webp'), 'removePhoto removed path');
  console.log('remove photo: ok');

  const cleared = await replacePhotoSet(models, {
    productIdBas,
    photos: [],
  });
  assert(cleared.mainPhoto === null, 'empty set clears main');
  assert(cleared.galleryCount === 0, 'empty set clears gallery');
  console.log('remove all via replacePhotoSet: ok');

  try {
    await replacePhotoSet(models, {
      productIdBas: '00000000-0000-0000-0000-000000000099',
      photos: ['products/x.webp'],
    });
    throw new Error('expected PRODUCT_NOT_FOUND');
  } catch (error) {
    assert(
      isMediaDomainError(error) && error.code === MEDIA_DOMAIN_ERROR.PRODUCT_NOT_FOUND,
      'product not found',
    );
  }
  console.log('product not found: ok');

  await models.Product.create({
    id_bas: TEST_PRODUCT_ID_BAS,
    name: 'Media Rollback Smoke Product',
    categories_id: product.categories_id,
    actual: true,
  });

  const transaction = await sequelize.transaction();
  try {
    await replacePhotoSet(
      models,
      {
        productIdBas: TEST_PRODUCT_ID_BAS,
        photos: ['products/rollback.webp'],
      },
      { transaction },
    );
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const rolledBackProduct = await findProductByIdBas(models, TEST_PRODUCT_ID_BAS);
  const rolledBackPlain = rolledBackProduct.get({ plain: true });
  assert(!rolledBackPlain.main_photo, 'rollback must not persist main_photo');

  const rolledBackGallery = await findPhotosByProductIdBas(models, TEST_PRODUCT_ID_BAS);
  assert(rolledBackGallery.length === 0, 'rollback must not persist gallery');
  console.log('transaction rollback: ok');

  await models.Product.destroy({ where: { id_bas: TEST_PRODUCT_ID_BAS } });
  await replacePhotoSet(models, {
    productIdBas,
    photos: ['products/restored-main.webp'],
  });

  console.log('media-write domain smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
