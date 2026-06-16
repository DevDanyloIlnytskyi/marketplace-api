const {
  MEDIA_DOMAIN_ERROR,
  MEDIA_DOMAIN_ERROR_MESSAGE,
  MediaDomainError,
  createMediaDomainError,
  isMediaDomainError,
} = require('./media-write.errors');
const {
  validateProductIdBas,
  requireValidPhotoPath,
  requireValidPhotoList,
} = require('./media-write.validation');
const {
  replacePhotoSet,
  addPhoto,
  replacePhoto,
  removePhoto,
} = require('./media-write.service');

module.exports = {
  MEDIA_DOMAIN_ERROR,
  MEDIA_DOMAIN_ERROR_MESSAGE,
  MediaDomainError,
  createMediaDomainError,
  isMediaDomainError,
  validateProductIdBas,
  requireValidPhotoPath,
  requireValidPhotoList,
  replacePhotoSet,
  addPhoto,
  replacePhoto,
  removePhoto,
};
