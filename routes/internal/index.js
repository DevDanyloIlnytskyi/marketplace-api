const express = require('express');

const router = express.Router();

router.use(require('./integration-auth-test'));
router.use(require('./scope-test'));
router.use(require('./integration-audit-test'));

module.exports = router;
