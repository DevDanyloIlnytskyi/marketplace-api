/**
 * Map stock chunk record → Stock Write domain input (Platform-5.7 contract).
 * @param {Record<string, unknown>} record
 * @returns {import('../../catalog/stock-write/stock-write.types').UpsertStockInput}
 */
function mapChunkRecordToStockInput(record) {
  const productIdBas = String(record?.productIdBas || record?.idBas || '').trim();

  return {
    productIdBas,
    quantity: record?.quantity,
  };
}

module.exports = {
  mapChunkRecordToStockInput,
};
