/**
 * Wrap async route handlers — forwards errors to integration error middleware.
 * @param {import('express').RequestHandler} fn
 * @returns {import('express').RequestHandler}
 */
function asyncHandler(fn) {
  return function asyncHandlerWrapper(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  asyncHandler,
};
