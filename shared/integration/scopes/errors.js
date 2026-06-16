const { INTEGRATION_ERROR_MESSAGE } = require('../http/constants');



const INTEGRATION_SCOPE_ERROR = Object.freeze({

  INSUFFICIENT_SCOPE: 'INSUFFICIENT_SCOPE',

  INTEGRATION_AUTH_REQUIRED: 'INTEGRATION_AUTH_REQUIRED',

});



/**

 * @param {import('express').Response} res

 * @param {import('express').Request} req

 * @param {string[]} required

 */

function sendInsufficientScopeError(res, req, required) {

  res.locals.integrationErrorCode = INTEGRATION_SCOPE_ERROR.INSUFFICIENT_SCOPE;



  /** @type {Record<string, unknown>} */

  const body = {

    success: false,

    code: INTEGRATION_SCOPE_ERROR.INSUFFICIENT_SCOPE,

    message: INTEGRATION_ERROR_MESSAGE.INSUFFICIENT_SCOPE,

    details: { required },

    requestId: req?.requestId,

  };



  if (req?.requestId) {

    res.setHeader('X-Request-Id', req.requestId);

  }



  return res.status(403).json(body);

}



module.exports = {

  INTEGRATION_SCOPE_ERROR,

  sendInsufficientScopeError,

};

