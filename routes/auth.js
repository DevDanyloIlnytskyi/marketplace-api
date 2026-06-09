const express = require('express');
const controller = require('../controllers/auth');
const blockRegistrationInProduction = require('../middleware/auth-production-guard');
const router = express.Router();

//localhost:5000/api/auth/reg
router.post('/reg', blockRegistrationInProduction, controller.registreted);

//localhost:5000/api/auth/log/
router.get('/log', controller.loginjson);

//localhost:5000/api/auth/token/?
router.get('/token', controller.gettoken);

module.exports = router;