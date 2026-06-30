/**
 * Platform-7.3 — temporary direct-write idempotency toggle.
 *
 * INTEGRATION_IDEMPOTENCY_ENABLED unset/false: direct PUT routes skip idempotency.
 * INTEGRATION_IDEMPOTENCY_ENABLED=true: Stage-7.2 behaviour (required on direct writes).
 *
 * POST /catalog/sync and /debug/idempotency-test always use route-level idempotency.
 */

/**
 * @returns {boolean}
 */
function isIntegrationIdempotencyEnabled() {
  const raw = process.env.INTEGRATION_IDEMPOTENCY_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

module.exports = {
  isIntegrationIdempotencyEnabled,
};
