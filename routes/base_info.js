const express = require('express');
const controller = require('../controllers/base_info');
const router = express.Router();

// Public read — matches legacy storefront (no Authorization on base_info).
router.get('/', controller.getALL);

module.exports = router;
