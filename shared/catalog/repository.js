const { buildProductGalleryPaths } = require('../product/gallery-paths');

async function attachGalleryPhotos(models, row) {
  if (!row || !row.id_bas) {
    return row;
  }

  const galleryRows = await models.Products_photo.findAll({
    where: { id_bas_product: row.id_bas },
    order: [['id', 'ASC']],
    attributes: ['photo'],
    raw: true,
  });

  return {
    ...row,
    photos: buildProductGalleryPaths(row.main_photo, galleryRows),
  };
}

const CATALOG_FROM = `
FROM products AS p
LEFT JOIN products_price AS pp ON pp.id_bas_product = p.id_bas
LEFT JOIN products_quantity AS pq ON pq.id_bas_product = p.id_bas
`;

const CATALOG_SELECT = `
SELECT
  p.id,
  p.id_bas,
  p.name,
  p.description,
  p.main_photo,
  p.categories_id,
  pp.price,
  pp.action_price,
  pq.quantity
${CATALOG_FROM}
`;

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Build WHERE clause and replacements for catalog filters.
 */
function buildCatalogWhere(query) {
  const clauses = [];
  const replacements = {};

  const idBas = query.id_bas || query.idBas || undefined;
  const categoryId = query.categoryId ?? query.categories_id ?? query.category_id_bas;
  const subcategoryId = query.subcategoryId;
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const minPrice = parseOptionalNumber(query.minPrice ?? query.min_price);
  const maxPrice = parseOptionalNumber(query.maxPrice ?? query.max_price);

  if (idBas) {
    clauses.push('p.id_bas = :idBas');
    replacements.idBas = idBas;
  }

  if (subcategoryId !== undefined && subcategoryId !== null && subcategoryId !== '') {
    clauses.push('p.categories_id = :subcategoryId');
    replacements.subcategoryId = subcategoryId;
  } else if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
    clauses.push(`p.categories_id IN (
      SELECT id FROM categories WHERE id = :categoryId
      UNION
      SELECT id FROM categories WHERE categories_id = :categoryId
    )`);
    replacements.categoryId = categoryId;
  }

  if (search.length > 0) {
    clauses.push(
      `(LOWER(p.name) LIKE :search OR LOWER(COALESCE(p.description, '')) LIKE :search)`,
    );
    replacements.search = `%${search.toLowerCase()}%`;
  }

  if (minPrice !== undefined) {
    clauses.push('pp.price >= :minPrice');
    replacements.minPrice = minPrice;
  }

  if (maxPrice !== undefined) {
    clauses.push('pp.price <= :maxPrice');
    replacements.maxPrice = maxPrice;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, replacements };
}

function buildCatalogOrderBy(sort) {
  const map = {
    default: 'p.id ASC',
    name_asc: 'p.name ASC',
    name_desc: 'p.name DESC',
    price_asc: 'pp.price ASC',
    price_desc: 'pp.price DESC',
  };
  return map[sort] ?? map.default;
}

function hasPaginationQuery(queryString) {
  return /(?:^|&)(page|limit|cursor)=/.test(queryString);
}

function hasFilterQuery(queryString) {
  return /(?:^|&)(page|limit|cursor|categoryId|subcategoryId|categories_id|category_id_bas|search|minPrice|maxPrice|min_price|max_price|sort|id_bas|idBas)=/.test(
    queryString,
  );
}

/**
 * Legacy offset pagination — used by /api/catalog controller.
 */
async function queryCatalogPage(sequelize, query, queryString) {
  const { where, replacements } = buildCatalogWhere(query);
  const orderBy = buildCatalogOrderBy(query.sort);
  const hasPagination =
    hasPaginationQuery(queryString) || hasFilterQuery(queryString);

  if (hasPagination) {
    const limit = Math.max(1, parseInt(query.limit, 10) || 50);
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const offset = (page - 1) * limit;

    const countSql = `
      SELECT COUNT(*) AS total
      ${CATALOG_FROM}
      ${where}
    `;

    const [countRows] = await sequelize.query(countSql, { replacements });
    const total = Number(countRows[0]?.total ?? 0);

    const dataSql = `
      ${CATALOG_SELECT}
      ${where}
      ORDER BY ${orderBy}
      LIMIT :limit OFFSET :offset
    `;

    const [rows] = await sequelize.query(dataSql, {
      replacements: { ...replacements, limit, offset },
    });

    return {
      mode: 'page',
      rows,
      count: total,
      pages: Math.ceil(total / limit) || 0,
      perpage: limit,
      page,
    };
  }

  const dataSql = `
    ${CATALOG_SELECT}
    ${where}
    ORDER BY ${orderBy}
  `;

  const [rows] = await sequelize.query(dataSql, { replacements });
  return { mode: 'list', rows };
}

/**
 * Cursor pagination for integration catalog reads.
 */
async function queryCatalogCursor(sequelize, query, { cursor, limit }) {
  const { where, replacements } = buildCatalogWhere(query);
  const orderBy = buildCatalogOrderBy(query.sort || 'default');

  /** @type {string[]} */
  const clauses = [];
  if (where) {
    clauses.push(where.replace(/^WHERE\s+/i, ''));
  }
  if (cursor?.id) {
    clauses.push('p.id > :cursorId');
    replacements.cursorId = cursor.id;
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const fetchLimit = limit + 1;

  const dataSql = `
    ${CATALOG_SELECT}
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT :limit
  `;

  const [rows] = await sequelize.query(dataSql, {
    replacements: { ...replacements, limit: fetchLimit },
  });

  return { rows, limit };
}

module.exports = {
  attachGalleryPhotos,
  buildCatalogWhere,
  buildCatalogOrderBy,
  queryCatalogPage,
  queryCatalogCursor,
  CATALOG_FROM,
  CATALOG_SELECT,
};
