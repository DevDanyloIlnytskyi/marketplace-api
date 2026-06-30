const { integrationIdempotency } = require('../idempotency');
const { isIntegrationIdempotencyEnabled } = require('../idempotency/config');
const { promoteStagedUploads } = require('./promote-staged-uploads');
const {
  getIntegrationMultipartProductParseChain,
  getIntegrationMultipartMediaParseChain,
} = require('./integration-multipart');

/** @type {import('express').RequestHandler} */
const noopMiddleware = (req, res, next) => next();

/**
 * Idempotency middleware for direct JSON PUT routes (products/prices/stock/media JSON branch).
 *
 * @returns {import('express').RequestHandler}
 */
function directWriteIdempotencyMiddleware() {
  return isIntegrationIdempotencyEnabled()
    ? integrationIdempotency({ required: true })
    : noopMiddleware;
}

/**
 * Middleware chain before JSON direct-write handler.
 *
 * @returns {import('express').RequestHandler[]}
 */
function buildJsonDirectWriteChain() {
  if (!isIntegrationIdempotencyEnabled()) {
    return [];
  }
  return [integrationIdempotency({ required: true })];
}

/**
 * Middleware chain before multipart direct-write handler.
 * Enabled: staging → fingerprint → idempotency → promote
 * Disabled: staging → promote
 *
 * @param {'product' | 'media'} kind
 * @returns {import('express').RequestHandler[]}
 */
function buildMultipartDirectWriteChain(kind) {
  const parseChain = kind === 'media'
    ? getIntegrationMultipartMediaParseChain()
    : getIntegrationMultipartProductParseChain();

  /** @type {import('express').RequestHandler[]} */
  const chain = [...parseChain];

  if (isIntegrationIdempotencyEnabled()) {
    chain.push(integrationIdempotency({ required: true }));
  }

  chain.push(promoteStagedUploads);
  return chain;
}

module.exports = {
  directWriteIdempotencyMiddleware,
  buildJsonDirectWriteChain,
  buildMultipartDirectWriteChain,
};
