const errorHandler = require('../utils/errorHandler');
require('dotenv').config();

const CATALOG_FROM = `
FROM products AS p
LEFT JOIN products_price AS pp ON pp.id_bas_product = p.id_bas
LEFT JOIN products_quantity AS pq ON pq.id_bas_product = p.id_bas
`;

const CATALOG_SELECT = `
SELECT
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
 * subcategoryId → exact category only.
 * categoryId only → category + all direct child categories.
 */
function buildWhere(query) {
  const clauses = [];
  const replacements = {};

  const idBas = query.id_bas || undefined;
  const categoryId = query.categoryId ?? query.categories_id;
  const subcategoryId = query.subcategoryId;
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const minPrice = parseOptionalNumber(query.minPrice);
  const maxPrice = parseOptionalNumber(query.maxPrice);

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

function hasPaginationQuery(queryString) {
  return /(?:^|&)(page|limit)=/.test(queryString);
}

function buildOrderBy(sort) {
  const map = {
    default: 'p.id ASC',
    name_asc: 'p.name ASC',
    name_desc: 'p.name DESC',
    price_asc: 'pp.price ASC',
    price_desc: 'pp.price DESC',
  };
  return map[sort] ?? map.default;
}

function hasFilterQuery(queryString) {
  return /(?:^|&)(page|limit|categoryId|subcategoryId|categories_id|search|minPrice|maxPrice|sort)=/.test(
    queryString,
  );
}

module.exports.getCatalog = async function (req, res) {
  try {
    const queryString = req.originalUrl.includes('?')
      ? req.originalUrl.split('?')[1]
      : '';
    const hasPagination =
      hasPaginationQuery(queryString) || hasFilterQuery(queryString);

    const { where, replacements } = buildWhere(req.query);
    const orderBy = buildOrderBy(req.query.sort);

    if (hasPagination) {
      const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const offset = (page - 1) * limit;

      const countSql = `
        SELECT COUNT(*) AS total
        ${CATALOG_FROM}
        ${where}
      `;

      const [countRows] = await req.sequelize.query(countSql, { replacements });
      const total = Number(countRows[0]?.total ?? 0);

      const dataSql = `
        ${CATALOG_SELECT}
        ${where}
        ORDER BY ${orderBy}
        LIMIT :limit OFFSET :offset
      `;

      const [rows] = await req.sequelize.query(dataSql, {
        replacements: { ...replacements, limit, offset },
      });

      return res.status(200).json({
        rows,
        count: total,
        pages: Math.ceil(total / limit) || 0,
        perpage: limit,
        page,
      });
    }

    const dataSql = `
      ${CATALOG_SELECT}
      ${where}
      ORDER BY ${orderBy}
    `;

    const [rows] = await req.sequelize.query(dataSql, { replacements });

    if (req.query.id_bas) {
      return res.status(200).json(rows[0] ?? null);
    }

    return res.status(200).json(rows);
  } catch (error) {
    errorHandler(res, error);
  }
};
