const errorHandler = require('../utils/errorHandler');
const {validationResult} = require('express-validator');
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
            await req.models.Products_propertie.findAll({
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
            await req.models.Products_propertie.destroy({
                where:{
                    id: req.query.id    
                }
            }).then(answer => {
                res.status(200).json({
                    message: 'Products propertie deleted.'
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
            await req.models.Products_propertie.findAndCountAll({
                where: {where: {id_bas_property: req.body.id_bas_property,
                    id_bas_product: req.body.id_bas_product}
                }
            }).then(answer => {
                if (answer.count>0) {
                    req.models.Product.update({
                        value: req.body.value 
                        },
                        {here: {id_bas_property: req.body.id_bas_property,
                            id_bas_product: req.body.id_bas_product}
                        }
                        );
                        res.status(200).json({
                        message: 'Products propertie updated.'
                    }); 
                }
                else {
                    req.models.Products_propertie.create({
                        id: null,
                        id_bas_property: req.body.id_bas_property,
                        id_bas_product: req.body.id_bas_product,
                        value: req.body.value});

                        res.status(200).json({
                        message: 'Products propertie greated.'
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