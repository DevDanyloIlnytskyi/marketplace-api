const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/properties');
const {body, query, param} = require('express-validator');
const router = express.Router();

//localhost:5000/api/properties
router.get('/', controller.getALL);

//localhost:5000/api/properties/by_id_bas/?id_bas
router.get('/by_id_bas/', 
[
    query('id_bas').notEmpty()
], 
controller.getByID);

// GET /api/properties/by-category/:idBasCategory — category + global properties
router.get('/by-category/:idBasCategory',
[
    param('idBasCategory').notEmpty()
],
controller.getByCategory);

//localhost:5000/api/properties
router.post('/', authenticate, 
[
    body('id_bas').notEmpty(),
    body('name').notEmpty(),
    body('id_bas_category').optional({ nullable: true })
], 
controller.findorcreate);

//localhost:5000/api/properties/?id_bas=
router.delete('/', authenticate, 
[
    query('id_bas').notEmpty()
], 
controller.remove);

module.exports = router;