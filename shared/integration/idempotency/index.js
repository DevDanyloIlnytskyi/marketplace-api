const {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_WRITE_METHODS,
} = require('./constants');
const {
  stableStringify,
  resolveFingerprintPath,
  computeRequestFingerprint,
} = require('./request-fingerprint');
const { defineIntegrationIdempotencyKeyModel } = require('./define-model');
const {
  createPending,
  findActive,
  completeRecord,
  deleteRecord,
  deleteExpired,
  findById,
} = require('./repository');
const {
  claimOrReplay,
  finalizeSuccess,
  finalizeFailure,
  buildExpiresAt,
} = require('./service');
const { attachIdempotencyResponseCapture } = require('./response-capture');
const { integrationIdempotency } = require('./middleware');
const { cleanupExpiredIdempotencyKeys } = require('./cleanup');

module.exports = {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_WRITE_METHODS,
  stableStringify,
  resolveFingerprintPath,
  computeRequestFingerprint,
  defineIntegrationIdempotencyKeyModel,
  createPending,
  findActive,
  completeRecord,
  deleteRecord,
  deleteExpired,
  findById,
  claimOrReplay,
  finalizeSuccess,
  finalizeFailure,
  buildExpiresAt,
  attachIdempotencyResponseCapture,
  integrationIdempotency,
  cleanupExpiredIdempotencyKeys,
};
