const constants = require('./constants');
const paths = require('./paths');
const imageUrl = require('./image-url');
const uploadPath = require('./upload-path');
const tenantImagesMiddleware = require('./static');

module.exports = {
  ...constants,
  ...paths,
  ...imageUrl,
  ...uploadPath,
  tenantImagesMiddleware,
};
