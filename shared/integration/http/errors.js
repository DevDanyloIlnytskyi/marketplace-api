const { INTEGRATION_ERROR_CODE, INTEGRATION_ERROR_MESSAGE } = require('./constants');

class IntegrationError extends Error {
  /**
   * @param {string} code
   * @param {{ message?: string, status?: number, details?: unknown }} [options]
   */
  constructor(code, options = {}) {
    super(options.message || INTEGRATION_ERROR_MESSAGE[code] || code);
    this.name = 'IntegrationError';
    this.code = code;
    this.status = options.status ?? 400;
    this.details = options.details;
  }
}

/**
 * @param {string} code
 * @param {{ message?: string, status?: number, details?: unknown }} [options]
 */
function createIntegrationError(code, options = {}) {
  return new IntegrationError(code, options);
}

function notFoundError(message) {
  return createIntegrationError(INTEGRATION_ERROR_CODE.NOT_FOUND, {
    message: message || INTEGRATION_ERROR_MESSAGE.NOT_FOUND,
    status: 404,
  });
}

module.exports = {
  IntegrationError,
  createIntegrationError,
  notFoundError,
};
