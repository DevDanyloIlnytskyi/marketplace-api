const errorHandler = require('../utils/errorHandler');
const {validationResult} = require('express-validator');
const paginate = require("express-paginate");
require('dotenv').config();


module.exports.getALL = async function(req, res){
    try {
        const limit = req.query.limit || undefined;
        const offset = req.offset || 0;
        let answer;
        if (limit === undefined) {
            answer = await req.models.Orders.findAll({});
        } else {
            answer = await req.models.Orders.findAndCountAll({
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
            const orderProducts = req.body.products ?? [];
            await req.models.Orders.findAndCountAll({
                where: {
                    id: req.body.id || null 
                }
            }).then(answer => {
                if (answer.count>0) {
                    req.models.Orders.update({
                        email: req.body.email || null,
                        total_price: req.body.total_price|| null,
                        active: req.body.active, 
                        products: orderProducts  
                        },
                        {where: {id: req.body.id}
                        }
                        );
                        res.status(200).json({
                        message: 'Order updated.',
                        id: req.body.id
                    }); 
                }
                else {
                    req.models.Orders.create({
                        id: null,
                        client_first_name: req.body.client_first_name,
                        client_second_name: req.body.client_second_name,
                        phone: req.body.phone,
                        email: req.body.email || null,
                        total_price: req.body.total_price|| null,
                        active: req.body.active|| false, 
                        date_created: req.body.date_created|| new Date(),                         
                        products: orderProducts   }).then(created => {
                        res.status(201).json({
                        message: 'Order created.',
                        id: created.id
                    });
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
