const constants = require('./constants');
const paths = require('./paths');
const imageUrl = require('./image-url');
const uploadPath = require('./upload-path');
const uploadValidation = require('./upload-validation');
const uploadMiddleware = require('./upload-middleware');
const tenantImagesMiddleware = require('./static');

module.exports = {
  ...constants,
  ...paths,
  ...imageUrl,
  ...uploadPath,
  ...uploadValidation,
  ...uploadMiddleware,
  ...require('./staging-storage'),
  tenantImagesMiddleware,
};
