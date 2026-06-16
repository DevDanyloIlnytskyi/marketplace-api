/**
 * @typedef {Object} UpsertProductInput
 * @property {string} idBas External product identifier (1C/BAS).
 * @property {string} name Product display name.
 * @property {string} [description] Product description.
 * @property {number} [categoryId] Internal category integer id.
 * @property {string} [categoryIdBas] External category id_bas (Integration API).
 * @property {string} [manufacturer] Manufacturer name.
 * @property {boolean} [actual] Visibility flag; defaults to true on create.
 * @property {string | null | undefined} [mainPhoto]
 *   - `undefined` — do not change on update; omit on create (null stored).
 *   - `null` — clear main_photo.
 *   - `string` — set main_photo path/value.
 */

/**
 * @typedef {Object} UpsertProductOptions
 * @property {import('sequelize').Transaction} [transaction] Optional Sequelize transaction.
 */

/**
 * @typedef {Object} UpsertProductResult
 * @property {string} idBas
 * @property {number} id Internal product id.
 * @property {boolean} created True when row was inserted.
 * @property {string | null} mainPhoto Current main_photo after operation.
 */

/**
 * @typedef {Object} ResolveCategoryInput
 * @property {number} [categoryId] Internal categories.id.
 * @property {string} [categoryIdBas] External categories.id_bas.
 */

/**
 * @typedef {Object} ResolveCategoryOptions
 * @property {import('sequelize').Transaction} [transaction]
 */

module.exports = {};
