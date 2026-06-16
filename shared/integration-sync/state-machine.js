const { SYNC_JOB_STATUSES } = require('./constants');
const { createSyncError, SYNC_ERROR_CODE } = require('./errors');

/** @type {Record<string, string[]>} */
const ALLOWED_TRANSITIONS = Object.freeze({
  pending: ['running'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running'],
  completed: [],
  failed: [],
  cancelled: [],
});

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
function canTransition(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) {
    return false;
  }
  return allowed.includes(toStatus);
}

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 */
function assertTransition(fromStatus, toStatus) {
  if (!SYNC_JOB_STATUSES.includes(fromStatus)) {
    throw createSyncError(SYNC_ERROR_CODE.INVALID_STATE_TRANSITION, {
      details: { fromStatus, toStatus, reason: 'UNKNOWN_FROM_STATUS' },
    });
  }

  if (!canTransition(fromStatus, toStatus)) {
    throw createSyncError(SYNC_ERROR_CODE.INVALID_STATE_TRANSITION, {
      details: { fromStatus, toStatus },
    });
  }
}

module.exports = {
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition,
};
