const express = require('express');
const { body } = require('express-validator');
const controller = require('../controllers/orders');

const router = express.Router();

/**
 * POST /api/storefront/orders — public storefront order intake.
 * Tenant isolation via Host / X-Marketplace-* (same as GET /api/catalog).
 * Intended for same-origin BFF proxy; Express listens on private network in production.
 */
router.post(
  '/orders',
  [
    body('client_first_name').notEmpty(),
    body('client_second_name').notEmpty(),
    body('phone').notEmpty(),
  ],
  controller.findorcreate,
);

module.exports = router;
