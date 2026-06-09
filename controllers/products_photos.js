const errorHandler = require('../utils/errorHandler');
const {validationResult} = require('express-validator');
const { getStoredMediaPath } = require('../shared/storage');
require('dotenv').config();

module.exports.getByProductID = async function(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        {
            res.status(400).json({
            message: errors.array()
            })
        }
    else {
        try {
            await req.models.Products_photo.findAll({
                where:{
                    id_bas_product: req.query.id_bas_product    
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

module.exports.create = async function(req, res){
    const errors = validationResult(req);
    if (!errors.isEmpty()) 
        {
            res.status(400).json({
            message: errors.array()
            })
        }
    else {
        try {
            await req.models.Products_photo.create({
                id: null,
                id_bas_product: req.body.id_bas_product,
                photo: req.file ? getStoredMediaPath(req.file) : ''
            }).then(answer => {
                res.status(201).json({
                    message: 'Products photo created.'
                });
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
            await req.models.Products_photo.destroy({
                where:{
                    id_bas_product: req.query.id_bas_product  
                }
            }).then(answer => {
                res.status(200).json({
                    message: 'Products photo deleted.'
                });
            }).catch((error) => {
                errorHandler(res, error);
            });      
        } catch (error) {
            errorHandler(res, error);
        }
    }
}