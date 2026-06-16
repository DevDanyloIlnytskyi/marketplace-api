const {
  MEDIA_DOMAIN_ERROR,
  createMediaDomainError,
} = require('./media-write.errors');
const {
  validatePhotoPath,
  validateAndNormalizePhotoList,
  MAX_PHOTO_PATH_LENGTH,
} = require('./media-path');

const MAX_PRODUCT_ID_BAS_LENGTH = 255;

/**
 * @param {unknown} value
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {string} productIdBas
 */
function validateProductIdBas(productIdBas) {
  if (!isNonEmptyString(productIdBas)) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS);
  }
  if (productIdBas.length > MAX_PRODUCT_ID_BAS_LENGTH) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS, {
      details: { maxLength: MAX_PRODUCT_ID_BAS_LENGTH },
    });
  }
}

/**
 * @param {unknown} photoPath
 * @returns {string}
 */
function requireValidPhotoPath(photoPath) {
  const check = validatePhotoPath(photoPath);
  if (!check.valid || !check.normalized) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.INVALID_PHOTO_PATH, {
      details: { reason: check.reason },
    });
  }
  return check.normalized;
}

/**
 * @param {unknown} photos
 * @returns {string[]}
 */
function requireValidPhotoList(photos) {
  if (!Array.isArray(photos)) {
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.INVALID_MEDIA_PAYLOAD, {
      message: 'photos must be an array.',
    });
  }

  try {
    return validateAndNormalizePhotoList(photos);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'DUPLICATE_PHOTO') {
        throw createMediaDomainError(MEDIA_DOMAIN_ERROR.DUPLICATE_PHOTO);
      }
      if (error.message === 'INVALID_PHOTO_PATH') {
        throw createMediaDomainError(MEDIA_DOMAIN_ERROR.INVALID_PHOTO_PATH);
      }
    }
    throw createMediaDomainError(MEDIA_DOMAIN_ERROR.INVALID_MEDIA_PAYLOAD);
  }
}

module.exports = {
  validateProductIdBas,
  requireValidPhotoPath,
  requireValidPhotoList,
  MAX_PHOTO_PATH_LENGTH,
  MAX_PRODUCT_ID_BAS_LENGTH,
};
