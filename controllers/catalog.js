const catalogRepository = require('../shared/catalog/repository');
const errorHandler = require('../utils/errorHandler');

module.exports.getCatalog = async function (req, res) {
  try {
    const queryString = req.originalUrl.includes('?')
      ? req.originalUrl.split('?')[1]
      : '';

    const result = await catalogRepository.queryCatalogPage(
      req.sequelize,
      req.query,
      queryString,
    );

    const idBas = req.query.id_bas || req.query.idBas;

    if (result.mode === 'page') {
      if (idBas) {
        const row = result.rows[0] ?? null;
        if (!row) {
          return res.status(200).json(null);
        }
        const enriched = await catalogRepository.attachGalleryPhotos(
          req.models,
          row,
        );
        return res.status(200).json(enriched);
      }

      return res.status(200).json({
        rows: result.rows,
        count: result.count,
        pages: result.pages,
        perpage: result.perpage,
        page: result.page,
      });
    }

    if (idBas) {
      const row = result.rows[0] ?? null;
      if (!row) {
        return res.status(200).json(null);
      }
      const enriched = await catalogRepository.attachGalleryPhotos(req.models, row);
      return res.status(200).json(enriched);
    }

    return res.status(200).json(result.rows);
  } catch (error) {
    errorHandler(res, error);
  }
};
