/**
 * @typedef {Object} UpsertPriceInput
 * @property {string} productIdBas External product id (products.id_bas).
 * @property {number} price Regular price — integer UAH units (≥ 0).
 * @property {number | null | undefined} [actionPrice]
 *   - `undefined` — preserve existing on update; null on create.
 *   - `null` — clear promotional price.
 *   - `number` — set action_price (integer ≥ 0).
 */

/**
 * @typedef {Object} UpsertPriceOptions
 * @property {import('sequelize').Transaction} [transaction]
 */

/**
 * @typedef {Object} UpsertPriceResult
 * @property {string} productIdBas
 * @property {number} price
 * @property {number | null} actionPrice
 * @property {boolean} created True when row was inserted.
 */

module.exports = {};
