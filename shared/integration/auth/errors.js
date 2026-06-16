const { INTEGRATION_ERROR_MESSAGE } = require('../http/constants');



/** Standard integration auth error codes (Platform-4.5.2). */

const INTEGRATION_AUTH_ERROR = Object.freeze({

  MISSING_API_KEY: 'MISSING_API_KEY',

  INVALID_API_KEY: 'INVALID_API_KEY',

  EXPIRED_API_KEY: 'EXPIRED_API_KEY',

  REVOKED_API_KEY: 'REVOKED_API_KEY',

  TENANT_MISMATCH: 'TENANT_MISMATCH',

});



/**

 * @param {import('express').Response} res

 * @param {number} status

 * @param {string} code

 * @param {import('express').Request} [req]

 */

function sendIntegrationAuthError(res, status, code, req) {

  res.locals.integrationErrorCode = code;



  /** @type {Record<string, unknown>} */

  const body = {

    success: false,

    code,

    message: INTEGRATION_ERROR_MESSAGE[code] || code,

  };



  if (req?.requestId) {

    body.requestId = req.requestId;

    res.setHeader('X-Request-Id', req.requestId);

  }



  return res.status(status).json(body);

}



module.exports = {

  INTEGRATION_AUTH_ERROR,

  sendIntegrationAuthError,

};

