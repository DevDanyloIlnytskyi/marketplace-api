/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveContentType(req) {
  return String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isMultipartRequest(req) {
  return resolveContentType(req) === 'multipart/form-data';
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isJsonRequest(req) {
  const contentType = resolveContentType(req);
  return contentType === 'application/json' || contentType === '';
}

module.exports = {
  resolveContentType,
  isJsonRequest,
  isMultipartRequest,
};
