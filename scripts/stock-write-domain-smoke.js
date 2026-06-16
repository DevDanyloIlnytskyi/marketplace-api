/**
 * Platform-5.7 — Stock Write Domain smoke / validation script.
 *
 * Usage:
 *   node scripts/stock-write-domain-smoke.js
 */
require('dotenv').config();

const { resolveSmokeTenant } = require('./lib/resolve-smoke-tenant');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const {
  upsertStock,
  validateUpsertStockInput,
  isStockDomainError,
  STOCK_DOMAIN_ERROR,
} = require('../shared/catalog/stock-write');
const { findStockByProductIdBas } = require('../shared/catalog/stock-repository');

const smokeTenant = resolveSmokeTenant();
const TENANT_ID = smokeTenant.tenantId;
const TEST_PRODUCT_ID_BAS = `pw57-smoke-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  try {
    validateUpsertStockInput({ productIdBas: 'x', quantity: -1 });
    throw new Error('expected INVALID_QUANTITY');
  } catch (error) {
    assert(
      isStockDomainError(error) && error.code === STOCK_DOMAIN_ERROR.INVALID_QUANTITY,
      'negative quantity validation',
    );
  }

  try {
    validateUpsertStockInput({ productIdBas: 'x', quantity: 1.5 });
    throw new Error('expected INVALID_QUANTITY for decimal');
  } catch (error) {
    assert(
      isStockDomainError(error) && error.code === STOCK_DOMAIN_ERROR.INVALID_QUANTITY,
      'decimal quantity validation',
    );
  }

  validateUpsertStockInput({ productIdBas: 'x', quantity: 0 });
  console.log('quantity=0 accepted: ok');
  console.log('validation layer: ok');

  const tenant = smokeTenant.tenant;
  console.log(`[smoke] tenant=${TENANT_ID} domain=${smokeTenant.tenantDomain} source=${smokeTenant.source}`);

  const models = getTenantModels(tenant);
  const sequelize = getTenantConnection(tenant);

  const product = await models.Product.findOne({ order: [['id', 'ASC']] });
  if (!product) {
    throw new Error('No product in tenant DB');
  }
  const productIdBas = product.id_bas;

  await models.Products_quantity.destroy({ where: { id_bas_product: productIdBas } });

  const created = await upsertStock(models, {
    productIdBas,
    quantity: 25,
  });
  assert(created.created === true, 'create should set created=true');
  console.log('create stock: ok');

  const updated = await upsertStock(models, {
    productIdBas,
    quantity: 15,
  });
  assert(updated.created === false, 'update should set created=false');
  assert(updated.quantity === 15, 'quantity updated');
  console.log('update stock: ok');

  const zeroStock = await upsertStock(models, {
    productIdBas,
    quantity: 0,
  });
  assert(zeroStock.quantity === 0, 'quantity=0 stored');
  console.log('quantity zero (out of stock): ok');

  try {
    await upsertStock(models, {
      productIdBas: '00000000-0000-0000-0000-000000000099',
      quantity: 10,
    });
    throw new Error('expected PRODUCT_NOT_FOUND');
  } catch (error) {
    assert(
      isStockDomainError(error) && error.code === STOCK_DOMAIN_ERROR.PRODUCT_NOT_FOUND,
      'missing product',
    );
  }
  console.log('product not found: ok');

  await models.Product.create({
    id_bas: TEST_PRODUCT_ID_BAS,
    name: 'Stock Rollback Smoke Product',
    categories_id: product.categories_id,
    actual: true,
  });

  const transaction = await sequelize.transaction();
  try {
    await upsertStock(
      models,
      { productIdBas: TEST_PRODUCT_ID_BAS, quantity: 99 },
      { transaction },
    );
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const rolledBack = await findStockByProductIdBas(models, TEST_PRODUCT_ID_BAS);
  assert(rolledBack === null, 'transaction rollback must not persist stock');
  console.log('transaction rollback: ok');

  await models.Product.destroy({ where: { id_bas: TEST_PRODUCT_ID_BAS } });
  await models.Products_quantity.update(
    { quantity: 15 },
    { where: { id_bas_product: productIdBas } },
  );

  console.log('stock-write domain smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
