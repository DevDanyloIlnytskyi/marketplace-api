const express = require('express');
const controller = require('../controllers/catalog');
const router = express.Router();

// GET /api/catalog — public storefront read (tenant via Host header)
// Query: page, limit, categoryId | categories_id, id_bas (single product)
router.get('/', controller.getCatalog);

module.exports = router;
