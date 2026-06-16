/**
 * Map media chunk record → Media Write domain input (Platform-5.8 replacePhotoSet contract).
 *
 * Domain expects ordered `photos[]` — first path becomes main_photo, rest → products_photos.
 * Chunk may also supply `mainPhoto` + `photos` (gallery only); main is prepended when distinct.
 *
 * @param {Record<string, unknown>} record
 * @returns {import('../../catalog/media-write/media-write.types').ReplacePhotoSetInput}
 */
function mapChunkRecordToMediaInput(record) {
  const productIdBas = String(record?.productIdBas || record?.idBas || '').trim();

  if (Array.isArray(record?.photos)) {
    const gallery = record.photos;
    const mainRaw = record?.mainPhoto;
    if (mainRaw !== undefined && mainRaw !== null && String(mainRaw).trim()) {
      const main = String(mainRaw).trim();
      const rest = gallery.filter(
        (entry) => String(entry || '').trim() && String(entry).trim() !== main,
      );
      return { productIdBas, photos: [main, ...rest] };
    }
    return { productIdBas, photos: gallery };
  }

  if (record?.mainPhoto !== undefined && record?.mainPhoto !== null && String(record.mainPhoto).trim()) {
    return { productIdBas, photos: [String(record.mainPhoto).trim()] };
  }

  return { productIdBas, photos: [] };
}

module.exports = {
  mapChunkRecordToMediaInput,
};
