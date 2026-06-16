/**
 * Platform-5.4 — Product Write Domain smoke / validation script.
 *
 * Usage:
 *   node scripts/product-write-domain-smoke.js
 */
require('dotenv').config();

const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const {
  upsertProduct,
  buildUpdatePatch,
  validateUpsertProductInput,
  isProductDomainError,
  PRODUCT_DOMAIN_ERROR,
} = require('../shared/catalog/product-write');
const { findProductByIdBas } = require('../shared/catalog/product-repository');
const { findCategoryByIdBas } = require('../shared/catalog/category-repository');

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const TEST_ID_BAS = `pw5-4-smoke-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testMainPhotoPatchSemantics() {
  const patch = buildUpdatePatch(
    {
      idBas: 'x',
      name: 'Name',
      categoryId: 1,
      mainPhoto: undefined,
    },
    1,
  );
  assert(!Object.prototype.hasOwnProperty.call(patch, 'main_photo'), 'undefined must omit main_photo');

  const clearPatch = buildUpdatePatch(
    {
      idBas: 'x',
      name: 'Name',
      categoryId: 1,
      mainPhoto: null,
    },
    1,
  );
  assert(clearPatch.main_photo === null, 'null must clear main_photo');

  const setPatch = buildUpdatePatch(
    {
      idBas: 'x',
      name: 'Name',
      categoryId: 1,
      mainPhoto: 'products/photo.jpg',
    },
    1,
  );
  assert(setPatch.main_photo === 'products/photo.jpg', 'string must set main_photo');
  console.log('main_photo patch semantics: ok');
}

async function main() {
  testMainPhotoPatchSemantics();

  try {
    validateUpsertProductInput({ idBas: '', name: 'x', categoryId: 1 });
    throw new Error('expected validation failure for empty idBas');
  } catch (error) {
    assert(
      isProductDomainError(error) && error.code === PRODUCT_DOMAIN_ERROR.INVALID_ID_BAS,
      'invalid idBas validation',
    );
  }
  console.log('validation layer: ok');

  const tenant = findTenantById(TENANT_ID);
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}`);
  }

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);

  const category = await models.Category.findOne({ order: [['id', 'ASC']] });
  if (!category) {
    throw new Error('No category in tenant DB — cannot run DB smoke');
  }

  const created = await upsertProduct(models, {
    idBas: TEST_ID_BAS,
    name: 'Platform 5.4 Smoke Product',
    description: 'created by product-write-domain-smoke',
    categoryId: category.id,
    manufacturer: 'SmokeTest',
    actual: true,
    mainPhoto: 'products/smoke-main.jpg',
  });
  assert(created.created === true, 'create should set created=true');
  console.log('create product: ok', created.idBas);

  const updated = await upsertProduct(models, {
    idBas: TEST_ID_BAS,
    name: 'Platform 5.4 Smoke Product Updated',
    categoryId: category.id,
    mainPhoto: undefined,
  });
  assert(updated.created === false, 'update should set created=false');

  const afterUpdate = await findProductByIdBas(models, TEST_ID_BAS);
  const plain = afterUpdate.get({ plain: true });
  assert(
    plain.main_photo === 'products/smoke-main.jpg',
    'update without mainPhoto must preserve main_photo',
  );
  console.log('update without mainPhoto preserves photo: ok');

  try {
    await upsertProduct(models, {
      idBas: `${TEST_ID_BAS}-bad-cat`,
      name: 'Bad Category Product',
      categoryIdBas: '00000000-0000-0000-0000-000000000099',
    });
    throw new Error('expected CATEGORY_NOT_FOUND');
  } catch (error) {
    assert(
      isProductDomainError(error) && error.code === PRODUCT_DOMAIN_ERROR.CATEGORY_NOT_FOUND,
      'invalid category must throw CATEGORY_NOT_FOUND',
    );
  }
  console.log('invalid category: ok');

  const rollbackIdBas = `${TEST_ID_BAS}-rollback`;
  const transaction = await sequelize.transaction();
  try {
    await upsertProduct(
      models,
      {
        idBas: rollbackIdBas,
        name: 'Rollback Product',
        categoryId: category.id,
      },
      { transaction },
    );
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const rolledBack = await findProductByIdBas(models, rollbackIdBas);
  assert(rolledBack === null, 'transaction rollback must not persist product');
  console.log('transaction rollback: ok');

  await models.Product.destroy({ where: { id_bas: TEST_ID_BAS } });
  console.log('product-write domain smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
