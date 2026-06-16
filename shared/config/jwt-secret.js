/**
 * Resolve JWT signing secret from environment.
 *
 * Canonical: JWTKEY
 * Legacy alias: jwtkey (backward compatible)
 *
 * @returns {string}
 */
function getJwtSecret() {
  const canonical = process.env.JWTKEY;
  if (canonical && String(canonical).trim()) {
    return String(canonical);
  }
  const legacy = process.env.jwtkey;
  if (legacy && String(legacy).trim()) {
    return String(legacy);
  }
  return '';
}

module.exports = {
  getJwtSecret,
};
