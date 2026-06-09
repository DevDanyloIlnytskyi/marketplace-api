const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/products_properties');
const {body, query} = require('express-validator');
const router = express.Router();

//localhost:5000/api/products_properties/?id_bas_product=
router.get('/', 
[
    query('id_bas_product').notEmpty()
], 
controller.getByProductID);

//localhost:5000/api/products_properties
router.post('/', authenticate, 
[
    body('id_bas_property').notEmpty(),
    body('id_bas_product').notEmpty()
], 
controller.findorcreate);

//localhost:5000/api/products_properties/?id=
router.patch('/', authenticate, 
[
    query('id').notEmpty()
], 
controller.remove);

module.exports = router;