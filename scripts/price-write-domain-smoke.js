/**
 * Platform-5.6 — Price Write Domain smoke / validation script.
 *
 * Usage:
 *   node scripts/price-write-domain-smoke.js
 */
require('dotenv').config();

const { findTenantById } = require('../shared/tenant/registry');
const { getTenantModels, getTenantConnection } = require('../shared/tenant/connection');
const {
  upsertPrice,
  validateUpsertPriceInput,
  isPriceDomainError,
  PRICE_DOMAIN_ERROR,
} = require('../shared/catalog/price-write');
const { findPriceByProductIdBas } = require('../shared/catalog/price-repository');
const { findProductByIdBas } = require('../shared/catalog/product-repository');

const TENANT_ID = process.env.SMOKE_TENANT_ID || 'demo';
const TEST_PRODUCT_ID_BAS = `pw56-smoke-${Date.now()}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  try {
    validateUpsertPriceInput({ productIdBas: 'x', price: -1 });
    throw new Error('expected INVALID_PRICE');
  } catch (error) {
    assert(
      isPriceDomainError(error) && error.code === PRICE_DOMAIN_ERROR.INVALID_PRICE,
      'negative price validation',
    );
  }

  try {
    validateUpsertPriceInput({ productIdBas: 'x', price: 12.5 });
    throw new Error('expected INVALID_PRICE for decimal');
  } catch (error) {
    assert(
      isPriceDomainError(error) && error.code === PRICE_DOMAIN_ERROR.INVALID_PRICE,
      'decimal price validation',
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

  await models.Products_price.destroy({ where: { id_bas_product: productIdBas } });

  const created = await upsertPrice(models, {
    productIdBas,
    price: 1500,
    actionPrice: 1200,
  });
  assert(created.created === true, 'create should set created=true');
  console.log('create price: ok');

  const updated = await upsertPrice(models, {
    productIdBas,
    price: 1600,
  });
  assert(updated.created === false, 'update should set created=false');

  const afterUpdate = await findPriceByProductIdBas(models, productIdBas);
  const plain = afterUpdate.get({ plain: true });
  assert(plain.price === 1600, 'price updated');
  assert(plain.action_price === 1200, 'action_price preserved when omitted');
  console.log('update price preserves actionPrice: ok');

  try {
    await upsertPrice(models, {
      productIdBas: '00000000-0000-0000-0000-000000000099',
      price: 100,
    });
    throw new Error('expected PRODUCT_NOT_FOUND');
  } catch (error) {
    assert(
      isPriceDomainError(error) && error.code === PRICE_DOMAIN_ERROR.PRODUCT_NOT_FOUND,
      'missing product',
    );
  }
  console.log('product not found: ok');

  const rollbackIdBas = TEST_PRODUCT_ID_BAS;
  await models.Product.create({
    id_bas: rollbackIdBas,
    name: 'Price Rollback Smoke Product',
    categories_id: product.categories_id,
    actual: true,
  });

  const transaction = await sequelize.transaction();
  try {
    await upsertPrice(
      models,
      { productIdBas: rollbackIdBas, price: 999 },
      { transaction },
    );
    await transaction.rollback();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  const rolledBack = await findPriceByProductIdBas(models, rollbackIdBas);
  assert(rolledBack === null, 'transaction rollback must not persist price');
  console.log('transaction rollback: ok');

  await models.Product.destroy({ where: { id_bas: rollbackIdBas } });
  await models.Products_price.update(
    { price: plain.price, action_price: plain.action_price },
    { where: { id_bas_product: productIdBas } },
  );

  console.log('price-write domain smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
