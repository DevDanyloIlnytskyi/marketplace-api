const express = require('express');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const controller = require('../controllers/products');
const {body, query} = require('express-validator');
const router = express.Router();

//localhost:5000/api/product
router.get('/', controller.getALL);

//localhost:5000/api/product/by_categories_id/?categories_id=
router.get('/by_categories_id/', 
[
    query('categories_id').notEmpty()
], 
controller.getByIDCategory);

//localhost:5000/api/product/by_id_bas/?id_bas=
router.get('/by_id_bas/', 
[
    query('id_bas').notEmpty()
], 
controller.getByID);

//localhost:5000/api/product
router.post('/', authenticate, upload.single('main_photo'), 
[
    body('id_bas').notEmpty(),
    body('name').notEmpty(),
    body('categories_id').notEmpty()
], 
controller.findorcreate);

//localhost:5000/api/product/?id_bas=
router.delete('/', authenticate, 
[
    query('id_bas').notEmpty()
], 
controller.remove);

module.exports = router;