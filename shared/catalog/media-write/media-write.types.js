/**
 * @typedef {Object} ReplacePhotoSetInput
 * @property {string} productIdBas
 * @property {string[]} photos Ordered full photo set (first = main).
 */

/**
 * @typedef {Object} AddPhotoInput
 * @property {string} productIdBas
 * @property {string} photoPath
 */

/**
 * @typedef {Object} ReplacePhotoInput
 * @property {string} productIdBas
 * @property {string} oldPhotoPath
 * @property {string} newPhotoPath
 */

/**
 * @typedef {Object} RemovePhotoInput
 * @property {string} productIdBas
 * @property {string} photoPath
 */

/**
 * @typedef {Object} MediaWriteOptions
 * @property {import('sequelize').Transaction} [transaction]
 */

/**
 * @typedef {Object} ReplacePhotoSetResult
 * @property {string} productIdBas
 * @property {string[]} photos Full ordered gallery (main + gallery rows)
 * @property {string | null} mainPhoto
 * @property {number} galleryCount Rows in products_photos after sync
 */

/**
 * @typedef {Object} PhotoMutationResult
 * @property {string} productIdBas
 * @property {string[]} photos
 * @property {string | null} mainPhoto
 * @property {number} galleryCount
 */

module.exports = {};
