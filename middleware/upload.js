const multer = require('multer');
const moment = require('moment');
const mkdirp = require('mkdirp');

const {
  getTenantProductImagePath,
  ensureTenantStorageDirs,
} = require('../shared/storage/paths');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    if (!req.tenant) {
      return cb(new Error('Tenant context required for file uploads'));
    }
    try {
      ensureTenantStorageDirs(req.tenant);
      const dest = getTenantProductImagePath(req.tenant);
      mkdirp.sync(dest);
      cb(null, dest);
    } catch (error) {
      cb(error);
    }
  },
  filename(req, file, cb) {
    const date = moment().format('DDMMYYYY-HHmmss_SSS');
    cb(null, `${date}-${file.originalname}`);
  },
});

const filefilter = (req, file, cb) => {
  if (
    file.mimetype === 'image/png'
    || file.mimetype === 'image/jpg'
    || file.mimetype === 'image/jpeg'
    || file.mimetype === 'image/svg'
    || file.mimetype === 'image/webp'
    || file.mimetype === 'image/avif'
  ) {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

const limits = {
  fileSize: 1024 * 1024 * 5,
};

module.exports = multer({
  storage,
  fileFilter: filefilter,
  limits,
});
