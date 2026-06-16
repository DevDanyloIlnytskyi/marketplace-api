const { Op } = require('sequelize');
const {
  decodeCursor,
  clampLimit,
  buildCursorPagination,
} = require('../../shared/integration/pagination');

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {import('sequelize').Model} row
 */
function mapOrderRow(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id: plain.id,
    client_first_name: plain.client_first_name,
    client_second_name: plain.client_second_name,
    phone: plain.phone,
    email: plain.email,
    total_price: plain.total_price,
    active: plain.active,
    date_created: plain.date_created,
    products: plain.products,
  };
}

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return undefined;
}

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {{ active?: boolean, since?: string, cursor?: string, limit?: number }} [options]
 */
async function listOrders(models, options = {}) {
  const limit = clampLimit(options.limit, { default: 50, max: 200 });
  const cursor = decodeCursor(options.cursor);

  /** @type {import('sequelize').WhereOptions} */
  const where = {};

  if (options.active !== undefined) {
    where.active = options.active;
  }

  if (options.since) {
    const sinceDate = new Date(options.since);
    if (!Number.isNaN(sinceDate.getTime())) {
      where.date_created = { [Op.gte]: sinceDate };
    }
  }

  if (cursor?.id) {
    where.id = { [Op.gt]: cursor.id };
  }

  const rows = await models.Orders.findAll({
    where,
    order: [['id', 'ASC']],
    limit: limit + 1,
  });

  const { items, pagination } = buildCursorPagination({
    rows: rows.map((row) => mapOrderRow(row)),
    limit,
  });

  return { items, pagination };
}

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {number | string} id
 */
async function getOrderById(models, id) {
  const parsedId = Number.parseInt(String(id), 10);
  if (!Number.isFinite(parsedId)) {
    return null;
  }
  const row = await models.Orders.findOne({ where: { id: parsedId } });
  if (!row) {
    return null;
  }
  return mapOrderRow(row);
}

module.exports = {
  listOrders,
  getOrderById,
  parseBooleanQuery,
};
