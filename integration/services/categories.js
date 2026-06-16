const { Op } = require('sequelize');
const {
  decodeCursor,
  clampLimit,
  buildCursorPagination,
} = require('../../shared/integration/pagination');

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 */
async function buildCategoryIdBasMap(models) {
  const rows = await models.Category.findAll({
    attributes: ['id', 'id_bas'],
    raw: true,
  });
  return new Map(rows.map((row) => [row.id, row.id_bas]));
}

/**
 * @param {import('sequelize').Model} row
 * @param {Map<number, string>} idBasByInternalId
 */
function mapCategoryRow(row, idBasByInternalId) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const parentInternalId = plain.categories_id;
  return {
    id_bas: plain.id_bas,
    name: plain.name,
    parent_id_bas:
      parentInternalId == null
        ? null
        : idBasByInternalId.get(parentInternalId) ?? null,
  };
}

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {{ parent_id_bas?: string | null, cursor?: string, limit?: number }} [options]
 */
async function listCategories(models, options = {}) {
  const limit = clampLimit(options.limit, { default: 100, max: 500 });
  const cursor = decodeCursor(options.cursor);
  const idBasMap = await buildCategoryIdBasMap(models);

  /** @type {import('sequelize').WhereOptions} */
  const where = {};

  if (options.parent_id_bas !== undefined) {
    if (options.parent_id_bas === null || options.parent_id_bas === 'null') {
      where.categories_id = null;
    } else {
      const parent = await models.Category.findOne({
        where: { id_bas: options.parent_id_bas },
      });
      if (!parent) {
        return {
          items: [],
          pagination: { next_cursor: null, has_more: false, limit },
        };
      }
      where.categories_id = parent.id;
    }
  }

  if (cursor?.id) {
    where.id = { [Op.gt]: cursor.id };
  }

  const rows = await models.Category.findAll({
    where,
    order: [['id', 'ASC']],
    limit: limit + 1,
  });

  const { items, pagination } = buildCursorPagination({
    rows: rows.map((row) => ({
      id: row.id,
      ...mapCategoryRow(row, idBasMap),
    })),
    limit,
  });

  return {
    items: items.map(({ id, ...rest }) => rest),
    pagination,
  };
}

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {string} idBas
 */
async function getCategoryByIdBas(models, idBas) {
  const row = await models.Category.findOne({ where: { id_bas: idBas } });
  if (!row) {
    return null;
  }
  const idBasMap = await buildCategoryIdBasMap(models);
  return mapCategoryRow(row, idBasMap);
}

module.exports = {
  listCategories,
  getCategoryByIdBas,
};
