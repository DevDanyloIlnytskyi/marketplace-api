const errorHandler = require('../utils/errorHandler');
const {validationResult} = require('express-validator');

require('dotenv').config();

module.exports.getALL = async function(req, res){
    try {
        await req.models.Category.findAll({
        }).then(answer => {
            res.status(200).json(answer);
         }).catch((error) => {
            errorHandler(res, error);
        });
            
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
            const idcat = req.query.categories_id;
            if (idcat === 'null') {
                answer = await req.models.Category.findAll({
                    where:{
                        categories_id: null      
                    }
                });
            } else {
                answer = await req.models.Category.findAll({
                    where:{
                        categories_id: req.query.categories_id      
                    }
                });
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
            await req.models.Category.findOne({
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
            await req.models.Category.destroy({
                where:{
                    id_bas: req.query.id_bas    
                }
            }).then(answer => {
                res.status(200).json({
                    message: 'Category deleted.'
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
                await req.models.Category.findAndCountAll({
                    where: {
                        id_bas: req.body.id_bas
                    }
                }).then(answer => {
                    if (answer.count>0) {
                        req.models.Category.update({
                            name: req.body.name,
                            categories_id: req.body.categories_id
                            },
                            {where: {id_bas: req.body.id_bas}
                            }
                            );
                            res.status(200).json({
                            message: 'Category updated.'
                        }); 
                    }
                    else {
                        req.models.Category.create({
                            id: null,
                            id_bas: req.body.id_bas,
                            categories_id: req.body.categories_id,
                            name: req.body.name});

                            res.status(200).json({
                            message: 'Category greated.'
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



