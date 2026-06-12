'use strict';

/**
 * Merge main_photo + products_photos rows into ordered, deduplicated path list.
 * main_photo is always first when present; gallery duplicates are skipped.
 */

function normalizeMediaPathKey(path) {
  if (!path || typeof path !== 'string') {
    return '';
  }

  let relative = path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
  if (relative.startsWith('images/')) {
    relative = relative.slice('images/'.length);
  }

  return relative;
}

/**
 * @param {string | null | undefined} mainPhoto
 * @param {Array<{ photo?: string | null } | string | null | undefined>} galleryRows
 * @returns {string[]}
 */
function buildProductGalleryPaths(mainPhoto, galleryRows) {
  /** @type {string[]} */
  const paths = [];
  const seen = new Set();

  function add(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) {
      return;
    }
    const key = normalizeMediaPathKey(raw);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    paths.push(raw.trim());
  }

  add(mainPhoto);

  if (Array.isArray(galleryRows)) {
    for (const row of galleryRows) {
      const photo = typeof row === 'string' ? row : row?.photo;
      add(photo);
    }
  }

  return paths;
}

module.exports = {
  normalizeMediaPathKey,
  buildProductGalleryPaths,
};
