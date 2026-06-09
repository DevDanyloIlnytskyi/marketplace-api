const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/category');
const {body, query} = require('express-validator');
const router = express.Router();

//localhost:5000/api/category
router.get('/', controller.getALL);

//localhost:5000/api/category/by_categories_id/?categories_id=
router.get('/by_categories_id/', 
[
    query('categories_id').notEmpty()
], 
controller.getByIDCategory);

//localhost:5000/api/category/by_id_bas/?id_bas=
router.get('/by_id_bas/', 
[
    query('id_bas').notEmpty()
], 
controller.getByID);

//localhost:5000/api/category
router.post('/', authenticate, 
[
    body('id_bas').notEmpty(),
    body('name').notEmpty()
], 
controller.findorcreate);

//localhost:5000/api/category/?id_bas=
router.delete('/', authenticate, 
[
    query('id_bas').notEmpty()
], 
controller.remove);

//localhost:5000/api/category/?id_bas=
//router.patch('/', authenticate, controller.update);

module.exports = router;