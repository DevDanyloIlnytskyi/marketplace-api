const crypto = require('crypto');

/**
 * SHA-256 hex digest of an integration API key.
 * Only the hash is stored in the database — never the plaintext key.
 * @param {string} apiKey
 * @returns {string} 64-char lowercase hex
 */
function hashIntegrationApiKey(apiKey) {
  return crypto
    .createHash('sha256')
    .update(String(apiKey), 'utf8')
    .digest('hex');
}

/**
 * Timing-safe comparison of two hash strings.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function compareKeyHashes(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  hashIntegrationApiKey,
  compareKeyHashes,
};
