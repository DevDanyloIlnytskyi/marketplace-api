const fs = require('fs');

/**
 * Best-effort removal of promoted files after a failed DB transaction.
 *
 * @param {import('express').Request} req
 */
async function rollbackPromotedUploads(req) {
  const paths = Array.isArray(req.uploadPromotedPaths) ? req.uploadPromotedPaths : [];

  for (const filePath of paths) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      /* best effort */
    }
  }

  req.uploadPromotedPaths = [];
  req.promotedMediaPaths = [];
}

module.exports = {
  rollbackPromotedUploads,
};
