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
            await req.models.Products_price.findAll({
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
            await req.models.Products_price.findAndCountAll({
                where: {
                    id_bas_product: req.body.id_bas_product
                }
            }).then(answer => {
                if (answer.count>0) {
                    req.models.Products_price.update({
                        price: req.body.price,
                        action_price: req.body.action_price
                        },
                        {where: {id_bas_product: req.body.id_bas_product}
                        }
                        );
                        res.status(200).json({
                        message: 'Products price updated.'
                    }); 
                }
                else {
                    req.models.Products_price.create({
                        id_bas_product: req.body.id_bas_product,
                        price: req.body.price,
                        action_price: req.body.action_price});

                        res.status(200).json({
                        message: 'Products price greated.'
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
