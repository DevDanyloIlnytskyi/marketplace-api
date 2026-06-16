const { resolvePublicMediaPath } = require('../../shared/storage/image-url');
const {
  queryCatalogCursor,
  attachGalleryPhotos,
} = require('../../shared/catalog/repository');
const {
  decodeCursor,
  clampLimit,
  buildCursorPagination,
  encodeCursor,
} = require('../../shared/integration/pagination');

/**
 * Resolve category_id_bas filter to internal category id for SQL repository.
 * @param {import('../../shared/tenant/model-registry').ReturnType<import('../../shared/tenant/model-registry').defineTenantModels>} models
 * @param {string | undefined} categoryIdBas
 */
async function resolveCategoryInternalId(models, categoryIdBas) {
  if (!categoryIdBas) {
    return undefined;
  }
  const row = await models.Category.findOne({
    where: { id_bas: categoryIdBas },
    attributes: ['id'],
    raw: true,
  });
  return row?.id;
}

/**
 * @param {import('express').Request} req
 * @param {{ cursor?: string, limit?: number }} [options]
 */
async function getCatalog(req, options = {}) {
  const limit = clampLimit(options.limit ?? req.query.limit, { default: 50, max: 200 });
  const cursor = decodeCursor(options.cursor ?? req.query.cursor);
  const categoryInternalId = await resolveCategoryInternalId(
    req.models,
    req.query.category_id_bas,
  );

  if (req.query.category_id_bas && categoryInternalId === undefined) {
    return {
      items: [],
      pagination: { next_cursor: null, has_more: false, limit },
    };
  }

  const query = {
    ...req.query,
    categoryId: categoryInternalId,
  };

  if (req.query.id_bas) {
    const { rows } = await queryCatalogCursor(req.sequelize, query, {
      cursor: null,
      limit: 1,
    });
    const row = rows[0] ?? null;
    if (!row) {
      return null;
    }
    const enriched = await attachGalleryPhotos(req.models, row);
    return mapCatalogItem(enriched, req.models);
  }

  const { rows } = await queryCatalogCursor(req.sequelize, query, { cursor, limit });
  const { items, pagination } = buildCursorPagination({ rows, limit });

  const idBasMap = await buildCategoryIdBasMap(req.models);
  return {
    items: items.map((row) => mapCatalogRow(row, idBasMap)),
    pagination,
  };
}

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

function mapCatalogRow(row, idBasMap) {
  return {
    id_bas: row.id_bas,
    name: row.name,
    price: row.price,
    action_price: row.action_price,
    quantity: row.quantity,
    category_id_bas:
      row.categories_id == null
        ? null
        : idBasMap.get(row.categories_id) ?? null,
    main_photo_url: resolvePublicMediaPath(row.main_photo),
  };
}

async function mapCatalogItem(row, models) {
  const idBasMap = await buildCategoryIdBasMap(models);
  return {
    ...mapCatalogRow(row, idBasMap),
    description: row.description,
    photos: row.photos,
  };
}

module.exports = {
  getCatalog,
  encodeCursor,
};
