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
            await req.models.Products_quantity.findAll({
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
            await req.models.Products_quantity.findAndCountAll({
                where: {
                    id_bas_product: req.body.id_bas_product
                }
            }).then(answer => {
                if (answer.count>0) {
                    req.models.Products_quantity.update({
                        quantity: req.body.quantity
                        },
                        {where: {id_bas_product: req.body.id_bas_product}
                        }
                        );
                        res.status(200).json({
                        message: 'Products quantity updated.'
                    }); 
                }
                else {
                    req.models.Products_quantity.create({
                        id_bas_product: req.body.id_bas_product,
                        quantity: req.body.quantity});

                        res.status(200).json({
                        message: 'Products quantity greated.'
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