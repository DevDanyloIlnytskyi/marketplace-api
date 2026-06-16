/**
 * Map price chunk record → Price Write domain input (Platform-5.6 contract).
 * @param {Record<string, unknown>} record
 * @returns {import('../../catalog/price-write/price-write.types').UpsertPriceInput}
 */
function mapChunkRecordToPriceInput(record) {
  const productIdBas = String(record?.productIdBas || record?.idBas || '').trim();

  /** @type {import('../../catalog/price-write/price-write.types').UpsertPriceInput} */
  const input = {
    productIdBas,
    price: record?.price,
  };

  if (record && Object.prototype.hasOwnProperty.call(record, 'actionPrice')) {
    input.actionPrice = record.actionPrice;
  }

  return input;
}

module.exports = {
  mapChunkRecordToPriceInput,
};
