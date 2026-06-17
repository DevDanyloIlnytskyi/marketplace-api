const { getStoredMediaPath } = require('../../storage/upload-path');
const { isMultipartRequest } = require('./content-type-detect');

/**
 * @param {unknown} value
 */
function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

/**
 * @param {unknown} value
 * @returns {boolean | undefined}
 */
function coerceBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return undefined;
}

/**
 * Map multipart product PUT → UpsertProductInput.
 *
 * @param {import('express').Request} req
 * @param {string} idBas
 * @returns {import('../../catalog/product-write/product-write.types').UpsertProductInput}
 */
function mapMultipartProductToInput(req, idBas) {
  const body = req.body || {};

  /** @type {import('../../catalog/product-write/product-write.types').UpsertProductInput} */
  const input = {
    idBas,
    name: body.name,
    categoryIdBas: body.categoryIdBas,
  };

  if (body.description !== undefined) {
    input.description = body.description;
  }
  if (body.manufacturer !== undefined) {
    input.manufacturer = body.manufacturer;
  }

  const actual = coerceBoolean(body.actual);
  if (actual !== undefined) {
    input.actual = actual;
  }

  if (req.file && req.file.path) {
    input.mainPhoto = getStoredMediaPath(req.file);
  } else if (isPresent(body.mainPhoto)) {
    input.mainPhoto = String(body.mainPhoto);
  }

  return input;
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function shouldUseMultipartProductMapper(req) {
  return isMultipartRequest(req) || Boolean(req.isMultipartIntegrationWrite);
}

module.exports = {
  mapMultipartProductToInput,
  shouldUseMultipartProductMapper,
  coerceBoolean,
};
