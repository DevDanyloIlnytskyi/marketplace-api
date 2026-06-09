const express = require('express');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const controller = require('../controllers/products_photos');
const {body, query} = require('express-validator');
const router = express.Router();

//localhost:5000/api/products_photos/?id_bas_product=
router.get('/', 
[
    query('id_bas_product').notEmpty()
], 
controller.getByProductID);

//localhost:5000/api/products_photos
router.post('/', authenticate, upload.single('photo'), 
[
    body('id_bas_product').notEmpty()
], 
controller.create);

//localhost:5000/api/products_photos/?id_bas_product=
router.delete('/', authenticate, 
[
    query('id_bas_product').notEmpty()
], 
controller.remove);

module.exports = router;