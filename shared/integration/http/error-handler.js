const { TenantResolutionError, tenantErrorStatus } = require('../../tenant/errors');
const { INTEGRATION_ERROR_CODE, INTEGRATION_ERROR_MESSAGE } = require('./constants');
const { IntegrationError } = require('./errors');
const { errorResponse } = require('./responses');
const {
  isProductDomainError,
  PRODUCT_DOMAIN_ERROR,
} = require('../../catalog/product-write');
const {
  isPriceDomainError,
  PRICE_DOMAIN_ERROR,
} = require('../../catalog/price-write');
const {
  isStockDomainError,
  STOCK_DOMAIN_ERROR,
} = require('../../catalog/stock-write');
const {
  isMediaDomainError,
  MEDIA_DOMAIN_ERROR,
} = require('../../catalog/media-write');

/**
 * @param {import('../../catalog/product-write/product-write.errors').ProductDomainError} err
 */
function productDomainErrorStatus(err) {
  if (err.code === PRODUCT_DOMAIN_ERROR.CATEGORY_NOT_FOUND) {
    return 404;
  }
  if (err.code === PRODUCT_DOMAIN_ERROR.PRODUCT_NOT_FOUND) {
    return 404;
  }
  return 400;
}

/**
 * @param {import('../../catalog/price-write/price-write.errors').PriceDomainError} err
 */
function priceDomainErrorStatus(err) {
  if (err.code === PRICE_DOMAIN_ERROR.PRODUCT_NOT_FOUND) {
    return 404;
  }
  if (err.code === PRICE_DOMAIN_ERROR.PRICE_NOT_FOUND) {
    return 404;
  }
  return 400;
}

/**
 * @param {import('../../catalog/stock-write/stock-write.errors').StockDomainError} err
 */
function stockDomainErrorStatus(err) {
  if (err.code === STOCK_DOMAIN_ERROR.PRODUCT_NOT_FOUND) {
    return 404;
  }
  if (err.code === STOCK_DOMAIN_ERROR.STOCK_NOT_FOUND) {
    return 404;
  }
  return 400;
}

/**
 * @param {import('../../catalog/media-write/media-write.errors').MediaDomainError} err
 */
function mediaDomainErrorStatus(err) {
  if (err.code === MEDIA_DOMAIN_ERROR.PRODUCT_NOT_FOUND) {
    return 404;
  }
  if (err.code === MEDIA_DOMAIN_ERROR.PHOTO_NOT_FOUND) {
    return 404;
  }
  return 400;
}

/**
 * Integration namespace error adapter — does not affect legacy routes.
 * @type {import('express').ErrorRequestHandler}
 */
function integrationErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof IntegrationError) {
    return errorResponse(res, req, {
      code: err.code,
      message: err.message,
      details: err.details,
      status: err.status,
    });
  }

  if (isProductDomainError(err)) {
    res.locals.integrationErrorCode = err.code;
    return errorResponse(res, req, {
      code: err.code,
      message: err.message,
      details: err.details,
      status: productDomainErrorStatus(err),
    });
  }

  if (isPriceDomainError(err)) {
    res.locals.integrationErrorCode = err.code;
    return errorResponse(res, req, {
      code: err.code,
      message: err.message,
      details: err.details,
      status: priceDomainErrorStatus(err),
    });
  }

  if (isStockDomainError(err)) {
    res.locals.integrationErrorCode = err.code;
    return errorResponse(res, req, {
      code: err.code,
      message: err.message,
      details: err.details,
      status: stockDomainErrorStatus(err),
    });
  }

  if (isMediaDomainError(err)) {
    res.locals.integrationErrorCode = err.code;
    return errorResponse(res, req, {
      code: err.code,
      message: err.message,
      details: err.details,
      status: mediaDomainErrorStatus(err),
    });
  }

  if (err instanceof TenantResolutionError) {
    return errorResponse(res, req, {
      code: err.code,
      message: err.message,
      status: tenantErrorStatus(err),
    });
  }

  console.error('[integration-api] unhandled error', {
    tenant: req.tenant?.id,
    requestId: req.requestId,
    path: req.originalUrl,
    message: err instanceof Error ? err.message : String(err),
  });

  return errorResponse(res, req, {
    code: INTEGRATION_ERROR_CODE.INTERNAL_ERROR,
    message: INTEGRATION_ERROR_MESSAGE.INTERNAL_ERROR,
    status: 500,
  });
}

module.exports = {
  integrationErrorHandler,
};
