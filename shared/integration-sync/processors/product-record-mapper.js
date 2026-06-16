/**
 * Map chunk record → Product Write domain input (Platform-5.5 contract).
 * @param {Record<string, unknown>} record
 * @returns {import('../../catalog/product-write/product-write.types').UpsertProductInput}
 */
function mapChunkRecordToProductInput(record) {
  const idBas = String(record?.idBas || '').trim();

  /** @type {import('../../catalog/product-write/product-write.types').UpsertProductInput} */
  const input = {
    idBas,
    name: record?.name,
    categoryIdBas: record?.categoryIdBas,
  };

  if (record?.description !== undefined) {
    input.description = record.description;
  }
  if (record?.manufacturer !== undefined) {
    input.manufacturer = record.manufacturer;
  }
  if (record?.actual !== undefined) {
    input.actual = record.actual;
  }
  if (record && Object.prototype.hasOwnProperty.call(record, 'mainPhoto')) {
    input.mainPhoto = record.mainPhoto;
  }

  return input;
}

module.exports = {
  mapChunkRecordToProductInput,
};
