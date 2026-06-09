const express = require('express');
const authenticate = require('../middleware/authenticate');
const upload = require('../middleware/upload');
const controller = require('../controllers/orders');
const {body, query} = require('express-validator');
const router = express.Router();

//localhost:5000/api/orders
router.get('/', authenticate, controller.getALL);

//localhost:5000/api/orders
router.post('/', authenticate,
[
    body('client_first_name').notEmpty(),
    body('client_second_name').notEmpty(),
    body('phone').notEmpty()
], 
controller.findorcreate);

module.exports = router;