/** @typedef {'UNKNOWN_HOST' | 'UNKNOWN_TENANT' | 'INACTIVE_TENANT' | 'INVALID_TENANT' | 'REGISTRY_ERROR'} TenantErrorCode */

class TenantResolutionError extends Error {
  /**
   * @param {TenantErrorCode} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'TenantResolutionError';
    this.code = code;
  }
}

/**
 * @param {TenantResolutionError} error
 */
function tenantErrorStatus(error) {
  switch (error.code) {
    case 'INACTIVE_TENANT':
      return 403;
    case 'UNKNOWN_HOST':
    case 'UNKNOWN_TENANT':
      return 404;
    case 'REGISTRY_ERROR':
      return 503;
    default:
      return 400;
  }
}

module.exports = {
  TenantResolutionError,
  tenantErrorStatus,
};
