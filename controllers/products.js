const errorHandler = require('../utils/errorHandler');
const {validationResult} = require('express-validator');
const paginate = require("express-paginate");
const { getStoredMediaPath } = require('../shared/storage');
const { buildProductGalleryPaths } = require('../shared/product/gallery-paths');
require('dotenv').config();

module.exports.getALL = async function(req, res){
    try {
        const limit = req.query.limit || undefined;
        const offset = req.offset || 0;
        let answer;
        if (limit === undefined) {
            answer = await req.models.Product.findAll({});
        } else {
            answer = await req.models.Product.findAndCountAll({
                offset: offset,
                limit: limit
            });
            answer.pages = Math.ceil(answer.count / limit);
            answer.perpage = limit;
        }
        res.status(200).json(answer);
    } catch (error) {
        errorHandler(res, error);
    }
}

module.exports.getByIDCategory = async function(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        {
            res.status(400).json({
            message: errors.array()
            })
        }
    else {
        try {
            const limit = req.query.limit || undefined;
            const offset = req.offset || 0;
            let answer;
            if (limit === undefined) {
                answer = await req.models.Product.findAll({
                    where:{
                        categories_id: req.query.categories_id
                    }
                });
            } else {
                answer = await req.models.Product.findAndCountAll({
                    offset: offset,
                    limit: limit,
                    where:{
                        categories_id: req.query.categories_id
                    }
                });
                answer.pages = Math.ceil(answer.count / limit);
                answer.perpage = limit;
            }
            res.status(200).json(answer);
        } catch (error) {
            errorHandler(res, error);
        }
    }
}

module.exports.getByID = async function(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        {
            res.status(400).json({
            message: errors.array()
            })
        }
    else {
        try {
            const product = await req.models.Product.findOne({
                where:{
                    id_bas: req.query.id_bas    
                }
            });

            if (!product) {
                return res.status(200).json(null);
            }

            const row = product.get({ plain: true });
            const galleryRows = await req.models.Products_photo.findAll({
                where: { id_bas_product: row.id_bas },
                order: [['id', 'ASC']],
                attributes: ['photo'],
                raw: true,
            });

            return res.status(200).json({
                ...row,
                photos: buildProductGalleryPaths(row.main_photo, galleryRows),
            });
        } catch (error) {
            errorHandler(res, error);
        }
    }
}

module.exports.remove = async function(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        {
            res.status(400).json({
            message: errors.array()
            })
        }
    else {
        try {
            await req.models.Product.destroy({
                where:{
                    id_bas: req.query.id_bas    
                }
            }).then(answer => {
                res.status(200).json({
                    message: 'Product deleted.'
                });
            }).catch((error) => {
                errorHandler(res, error);
            });      
        } catch (error) {
            errorHandler(res, error);
        }
    }
}

module.exports.findorcreate = async function (req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            message: errors.array(),
        });
    }

    try {
        const { count } = await req.models.Product.findAndCountAll({
            where: {
                id_bas: req.body.id_bas,
            },
        });

        const fields = {
            name: req.body.name,
            description: req.body.description,
            categories_id: req.body.categories_id,
            actual: req.body.actual || 1,
            manufacturer: req.body.manufacturer,
        };

        if (count > 0) {
            /** @type {Record<string, unknown>} */
            const patch = { ...fields };
            if (req.file) {
                patch.main_photo = getStoredMediaPath(req.file);
            }

            await req.models.Product.update(patch, {
                where: { id_bas: req.body.id_bas },
            });

            return res.status(200).json({
                message: 'Product updated.',
            });
        }

        await req.models.Product.create({
            id: null,
            id_bas: req.body.id_bas,
            ...fields,
            main_photo: req.file ? getStoredMediaPath(req.file) : '',
        });

        return res.status(200).json({
            message: 'Product greated.',
        });
    } catch (error) {
        errorHandler(res, error);
    }
};