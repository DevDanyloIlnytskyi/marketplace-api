const errorHandler = require('../utils/errorHandler');
const { validationResult } = require('express-validator');
const {
  findByCategoryIncludingGlobal,
  getProductCharacteristics,
} = require('../shared/properties/repository');
require('dotenv').config();

function buildPropertyUpsertFields(body) {
  const fields = { name: body.name };
  if ('id_bas_category' in body) {
    fields.id_bas_category = body.id_bas_category ?? null;
  }
  return fields;
}

module.exports.getALL = async function (req, res) {
  try {
    await req.models.Propertie.findAll({}).then((answer) => {
      res.status(200).json(answer);
    }).catch((error) => {
      errorHandler(res, error);
    });
  } catch (error) {
    errorHandler(res, error);
  }
};

module.exports.getByID = async function (req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      message: errors.array(),
    });
  } else {
    try {
      await req.models.Propertie.findOne({
        where: {
          id_bas: req.query.id_bas,
        },
      }).then((answer) => {
        res.status(200).json(answer);
      }).catch((error) => {
        errorHandler(res, error);
      });
    } catch (error) {
      errorHandler(res, error);
    }
  }
};

module.exports.getByCategory = async function (req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array(),
    });
  }

  try {
    const rows = await findByCategoryIncludingGlobal(
      req.models,
      req.params.idBasCategory,
    );
    return res.status(200).json(rows);
  } catch (error) {
    return errorHandler(res, error);
  }
};

/** Exported for future product detail routes — not mounted as HTTP handler yet. */
module.exports.getProductCharacteristics = getProductCharacteristics;

module.exports.remove = async function (req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      message: errors.array(),
    });
  } else {
    try {
      await req.models.Propertie.destroy({
        where: {
          id_bas: req.query.id_bas,
        },
      }).then(() => {
        res.status(200).json({
          message: 'Propertie deleted.',
        });
      }).catch((error) => {
        errorHandler(res, error);
      });
    } catch (error) {
      errorHandler(res, error);
    }
  }
};

module.exports.findorcreate = async function (req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      message: errors.array(),
    });
  } else {
    try {
      const existing = await req.models.Propertie.findAndCountAll({
        where: {
          id_bas: req.body.id_bas,
        },
      });

      if (existing.count > 0) {
        await req.models.Propertie.update(
          buildPropertyUpsertFields(req.body),
          { where: { id_bas: req.body.id_bas } },
        );
        res.status(200).json({
          message: 'Propertie updated.',
        });
      } else {
        await req.models.Propertie.create({
          id: null,
          id_bas: req.body.id_bas,
          name: req.body.name,
          id_bas_category: req.body.id_bas_category ?? null,
        });
        res.status(200).json({
          message: 'Propertie greated.',
        });
      }
    } catch (error) {
      errorHandler(res, error);
    }
  }
};
