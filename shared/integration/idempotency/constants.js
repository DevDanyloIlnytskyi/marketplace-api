/** HTTP header for client-provided idempotency tokens. */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Max wire length for Idempotency-Key (Platform-5.1 contract). */
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/** Default retention window — 24 hours (ERP nightly + retry window). */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const IDEMPOTENCY_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
});

/** Write methods that participate in idempotency when middleware is mounted. */
const IDEMPOTENCY_WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

module.exports = {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_STATUS,
  IDEMPOTENCY_WRITE_METHODS,
};
