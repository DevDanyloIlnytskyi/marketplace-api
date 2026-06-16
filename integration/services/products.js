const { Op } = require('sequelize');
const { resolvePublicMediaPath } = require('../../shared/storage/image-url');
const { buildProductGalleryPaths } = require('../../shared/product/gallery-paths');
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
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {string | undefined} categoryIdBas
 */
async function resolveCategoryIds(models, categoryIdBas) {
  if (!categoryIdBas) {
    return null;
  }
  const category = await models.Category.findOne({
    where: { id_bas: categoryIdBas },
  });
  if (!category) {
    return [];
  }
  const children = await models.Category.findAll({
    where: { categories_id: category.id },
    attributes: ['id'],
    raw: true,
  });
  return [category.id, ...children.map((child) => child.id)];
}

/**
 * @param {import('sequelize').Model} row
 * @param {Map<number, string>} idBasByInternalId
 */
function mapProductRow(row, idBasByInternalId) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    id_bas: plain.id_bas,
    name: plain.name,
    category_id_bas:
      plain.categories_id == null
        ? null
        : idBasByInternalId.get(plain.categories_id) ?? null,
    description: plain.description,
    actual: plain.actual,
    manufacturer: plain.manufacturer,
    main_photo_url: resolvePublicMediaPath(plain.main_photo),
  };
}

/**
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {{ category_id_bas?: string, cursor?: string, limit?: number }} [options]
 */
async function listProducts(models, options = {}) {
  const limit = clampLimit(options.limit, { default: 50, max: 200 });
  const cursor = decodeCursor(options.cursor);
  const idBasMap = await buildCategoryIdBasMap(models);

  /** @type {import('sequelize').WhereOptions} */
  const where = {};

  if (options.category_id_bas) {
    const categoryIds = await resolveCategoryIds(models, options.category_id_bas);
    if (categoryIds && categoryIds.length === 0) {
      return {
        items: [],
        pagination: { next_cursor: null, has_more: false, limit },
      };
    }
    if (categoryIds) {
      where.categories_id = { [Op.in]: categoryIds };
    }
  }

  if (cursor?.id) {
    where.id = { [Op.gt]: cursor.id };
  }

  const rows = await models.Product.findAll({
    where,
    order: [['id', 'ASC']],
    limit: limit + 1,
  });

  const { items, pagination } = buildCursorPagination({
    rows: rows.map((row) => ({
      id: row.id,
      ...mapProductRow(row, idBasMap),
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
async function getProductByIdBas(models, idBas) {
  const product = await models.Product.findOne({ where: { id_bas: idBas } });
  if (!product) {
    return null;
  }

  const idBasMap = await buildCategoryIdBasMap(models);
  const mapped = mapProductRow(product, idBasMap);

  const galleryRows = await models.Products_photo.findAll({
    where: { id_bas_product: idBas },
    order: [['id', 'ASC']],
    attributes: ['photo'],
    raw: true,
  });

  return {
    ...mapped,
    media_count: buildProductGalleryPaths(product.main_photo, galleryRows).length,
  };
}

module.exports = {
  listProducts,
  getProductByIdBas,
};
