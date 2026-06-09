/**
 * Blocks open registration when NODE_ENV=production.
 */
function blockRegistrationInProduction(req, res, next) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      code: 'REGISTRATION_DISABLED',
      message: 'User registration is disabled in production.',
    });
  }
  return next();
}

module.exports = blockRegistrationInProduction;
