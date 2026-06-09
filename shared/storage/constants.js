/** Public URL prefix for tenant media (served by Express / proxied by Nginx). */
const MEDIA_PUBLIC_PREFIX = '/images';

/** Subdirectories under storage/{tenant}/ */
const STORAGE_SUBDIRS = {
  products: 'products',
  logos: 'logos',
  misc: 'misc',
};

module.exports = {
  MEDIA_PUBLIC_PREFIX,
  STORAGE_SUBDIRS,
};
