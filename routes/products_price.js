const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/products_price');
const {body, query} = require('express-validator');
const router = express.Router();

//localhost:5000/api/products_price/?id_bas_product=
router.get('/', 
[
    query('id_bas_product').notEmpty()
], 
controller.getByProductID);

//localhost:5000/api/products_price
router.post('/', authenticate, 
[
    body('id_bas_product').notEmpty()
], 
controller.findorcreate);

module.exports = router;