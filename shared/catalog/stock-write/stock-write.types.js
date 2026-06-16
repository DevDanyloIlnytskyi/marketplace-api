/**
 * @typedef {Object} UpsertStockInput
 * @property {string} productIdBas External product id (products.id_bas).
 * @property {number} quantity Available quantity — integer ≥ 0.
 */

/**
 * @typedef {Object} UpsertStockOptions
 * @property {import('sequelize').Transaction} [transaction]
 */

/**
 * @typedef {Object} UpsertStockResult
 * @property {string} productIdBas
 * @property {number} quantity
 * @property {boolean} created True when row was inserted.
 */

module.exports = {};
