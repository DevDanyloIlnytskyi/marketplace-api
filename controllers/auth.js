const jwt = require('jsonwebtoken');
const bcrypt =require('bcryptjs');
const errorHandler = require('../utils/errorHandler');
require('dotenv').config();

module.exports.registreted = async function(req, res){
    await req.models.User.findOne({
        where: {
            login: req.body.login
        }
    }).then(answer => {
        if (answer){
            res.status(409).json({
                message: 'User created before.'
            });
        }
        else {
            const salt = bcrypt.genSaltSync(10);
            const password = req.body.password;
            const secret_key = req.body.secret_key;
            req.models.User.create({
                id: null,
                login: req.body.login,
                password: bcrypt.hashSync(password, salt),
                secret_key: bcrypt.hashSync(secret_key, salt)
            }).then(answer => {
                res.status(201).json({
                    message: 'User created.'
                });
            }).catch((error) => {
                console.error('Failed to create a new record : ', error);
            });
        }
     }).catch((error) => {
        errorHandler(res, error);
    });
    
}

module.exports.loginjson = async function(req, res){
    await req.models.User.findOne({
        where: {
            login: req.body.login  
        }
    }).then(answer => {
        if (answer){
            const passwordResult = bcrypt.compareSync(req.body.password, answer.password);
            if (passwordResult){
                const token = jwt.sign({
                    login: answer.login
                }, process.env.jwtkey, {expiresIn: 60*60});

                res.status(200).json({
                    token: `Bearer ${token}`
                });                 
            }
            else{
                res.status(401).json({
                    message: 'Invalid password'
                });   
            }
        }
        else {
            res.status(404).json({
                message: 'User do not found'
            });
        }
     }).catch((error) => {
        errorHandler(res, error);
    });
}

module.exports.gettoken = async function(req, res){
    await req.models.User.findOne({
        where: {
            login: req.query.login  
        }
    }).then(answer => {
        if (answer){
            const passwordResult = bcrypt.compareSync(req.query.password, answer.password);
            if (passwordResult){
                const token = jwt.sign({
                    login: answer.login
                }, process.env.jwtkey, {expiresIn: 60*60});

                res.status(200).json({
                    token: `Bearer ${token}`
                });                 
            }
            else{
                res.status(401).json({
                    message: 'Invalid password'
                });   
            }
        }
        else {
            res.status(404).json({
                message: 'User do not found'
            });
        }
     }).catch((error) => {
        errorHandler(res, error);
    });
}
