const {
  defaultProductImageUpload,
} = require('../shared/storage/upload-middleware');
const { handleUploadError } = require('../shared/storage/upload-validation');

module.exports = defaultProductImageUpload;
module.exports.handleUploadError = handleUploadError;
