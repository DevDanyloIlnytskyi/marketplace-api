const errorHandler = require('../utils/errorHandler');
const {validationResult} = require('express-validator');
const paginate = require("express-paginate");
const { getStoredMediaPath } = require('../shared/storage');
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
            await req.models.Product.findOne({
                where:{
                    id_bas: req.query.id_bas    
                }
            }).then(answer => {
                res.status(200).json(answer);
            }).catch((error) => {
                errorHandler(res, error);
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
    if (!errors.isEmpty()) 
        {
            res.status(400).json({
            message: errors.array()
            })
        }
    else {
        try {
            await req.models.Product.findAndCountAll({
                where: {
                    id_bas: req.body.id_bas
                }
            }).then(answer => {
                if (answer.count>0) {
                    req.models.Product.update({
                        name: req.body.name,
                        description: req.body.description,
                        main_photo: req.file ? getStoredMediaPath(req.file) : '',
                        categories_id: req.body.categories_id,
                        actual: req.body.actual || 1,
                        manufacturer: req.body.manufacturer
                        },
                        {where: {id_bas: req.body.id_bas}
                        }
                        );
                        res.status(200).json({
                        message: 'Product updated.'
                    }); 
                }
                else {
                    req.models.Product.create({
                        id: null,
                        id_bas: req.body.id_bas,
                        name: req.body.name,
                        description: req.body.description,
                        main_photo: req.file ? getStoredMediaPath(req.file) : '',
                        categories_id: req.body.categories_id,
                        actual: req.body.actual || 1,
                        manufacturer: req.body.manufacturer
                    });
                        res.status(200).json({
                        message: 'Product greated.'
                    });
                }
            }).catch((error) => {
                errorHandler(res, error);
            });
        } catch (error) {
            errorHandler(res, error);
        }
    }
}