/** Integration API key lifecycle statuses (Platform-4.5). */
const INTEGRATION_KEY_STATUS = Object.freeze({
  ACTIVE: 'active',
  ROTATING: 'rotating',
  REVOKED: 'revoked',
  EXPIRED: 'expired',
});

/** Statuses that may authenticate (Platform-4.5.2 middleware will use this). */
const AUTHENTICATABLE_STATUSES = Object.freeze([
  INTEGRATION_KEY_STATUS.ACTIVE,
  INTEGRATION_KEY_STATUS.ROTATING,
]);

const KEY_WIRE_PREFIX = 'mpk_';
const KEY_ID_PREFIX = 'iak_';
const KEY_PREFIX_DISPLAY_LENGTH = 16;
const KEY_RANDOM_BYTES = 24;

module.exports = {
  INTEGRATION_KEY_STATUS,
  AUTHENTICATABLE_STATUSES,
  KEY_WIRE_PREFIX,
  KEY_ID_PREFIX,
  KEY_PREFIX_DISPLAY_LENGTH,
  KEY_RANDOM_BYTES,
};
