/** Domain error codes — no HTTP mapping in this layer. */
const MEDIA_DOMAIN_ERROR = Object.freeze({
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PHOTO_NOT_FOUND: 'PHOTO_NOT_FOUND',
  INVALID_PHOTO_PATH: 'INVALID_PHOTO_PATH',
  DUPLICATE_PHOTO: 'DUPLICATE_PHOTO',
  INVALID_MEDIA_PAYLOAD: 'INVALID_MEDIA_PAYLOAD',
  INVALID_PRODUCT_ID_BAS: 'INVALID_PRODUCT_ID_BAS',
});

const MEDIA_DOMAIN_ERROR_MESSAGE = Object.freeze({
  [MEDIA_DOMAIN_ERROR.PRODUCT_NOT_FOUND]: 'Product not found.',
  [MEDIA_DOMAIN_ERROR.PHOTO_NOT_FOUND]: 'Photo not found.',
  [MEDIA_DOMAIN_ERROR.INVALID_PHOTO_PATH]: 'Photo path is invalid.',
  [MEDIA_DOMAIN_ERROR.DUPLICATE_PHOTO]: 'Duplicate photo path in request.',
  [MEDIA_DOMAIN_ERROR.INVALID_MEDIA_PAYLOAD]: 'Media payload is invalid.',
  [MEDIA_DOMAIN_ERROR.INVALID_PRODUCT_ID_BAS]: 'Product id is invalid.',
});

class MediaDomainError extends Error {
  /**
   * @param {string} code
   * @param {{ message?: string, details?: unknown }} [options]
   */
  constructor(code, options = {}) {
    super(options.message || MEDIA_DOMAIN_ERROR_MESSAGE[code] || code);
    this.name = 'MediaDomainError';
    this.code = code;
    this.details = options.details;
  }
}

/**
 * @param {string} code
 * @param {{ message?: string, details?: unknown }} [options]
 */
function createMediaDomainError(code, options = {}) {
  return new MediaDomainError(code, options);
}

function isMediaDomainError(error) {
  return error instanceof MediaDomainError;
}

module.exports = {
  MEDIA_DOMAIN_ERROR,
  MEDIA_DOMAIN_ERROR_MESSAGE,
  MediaDomainError,
  createMediaDomainError,
  isMediaDomainError,
};
